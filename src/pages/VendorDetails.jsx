import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DateRangePicker, {
  inRange,
  currentMonthRange,
} from "../components/ui/DateRangePicker";
import VendorForm from "../components/forms/VendorForm";
import {
  getVendor,
  getVendorPurchases,
  updateVendor,
  deleteVendor,
} from "../services/vendorsService";
import {
  getProducts,
  addBulkPurchase,
  createProduct,
} from "../services/productsService";
import { formatCurrency, formatDate } from "../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Group purchases into batches. Rows inserted in one bulk order share the same
// created_at (Postgres now() is constant per statement), so that's the batch key.
function groupByBatch(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.created_at)) map.set(r.created_at, []);
    map.get(r.created_at).push(r);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    date: key,
    items,
    total: items.reduce((s, t) => s + (Number(t.total_amount) || 0), 0),
  }));
}

export default function VendorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [dateRange, setDateRange] = useState(currentMonthRange());
  const [viewMode, setViewMode] = useState("batch"); // "batch" | "list"

  const doDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteVendor(id);
      navigate("/vendors");
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [v, p] = await Promise.all([getVendor(id), getVendorPurchases(id)]);
      setVendor(v);
      setPurchases(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <p className="text-gray-400">Loading vendor...</p>;
  if (!vendor) {
    return (
      <div>
        <p className="text-gray-500">Vendor not found.</p>
        <Link to="/vendors" className="text-indigo-600">
          ← Back to vendors
        </Link>
      </div>
    );
  }

  const totalSpent = purchases.reduce(
    (s, t) => s + (Number(t.total_amount) || 0),
    0
  );

  // Apply the date range, then group into batches (one bulk order = one batch).
  const filteredPurchases = purchases.filter((t) =>
    inRange(t.created_at, dateRange.start, dateRange.end)
  );
  const batches = groupByBatch(filteredPurchases);

  return (
    <div>
      <Link
        to="/vendors"
        className="mb-3 inline-block text-sm text-indigo-600 hover:underline"
      >
        ← Back to vendors
      </Link>

      <PageHeader
        title={vendor.name}
        subtitle="Vendor"
        action={
          <Button onClick={() => setBulkOpen(true)}>+ Bulk Purchase</Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Details</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setEditOpen(true)}
                className="text-sm text-indigo-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setDeleteError("");
                  setConfirmOpen(true);
                }}
                className="text-sm text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Phone" value={vendor.phone || "-"} />
            <Row label="Address" value={vendor.address || "-"} />
            <Row label="Note" value={vendor.note || "-"} />
          </dl>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard
            label="Total Orders"
            value={purchases.length}
            icon="🧾"
            accent="indigo"
          />
          <StatCard
            label="Total Spent"
            value={formatCurrency(totalSpent)}
            icon="🛒"
            accent="amber"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-gray-800">Purchase History</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
              <button
                type="button"
                onClick={() => setViewMode("batch")}
                className={`px-3 py-1 ${
                  viewMode === "batch"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                By batch
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1 ${
                  viewMode === "list"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                All items
              </button>
            </div>
            <DateRangePicker
              start={dateRange.start}
              end={dateRange.end}
              onChange={setDateRange}
            />
          </div>
        </div>

        {filteredPurchases.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No purchases in this range.
          </p>
        ) : viewMode === "batch" ? (
          <div className="max-h-[32rem] space-y-4 overflow-auto p-4">
            {batches.map((b) => (
              <div
                key={b.key}
                className="overflow-hidden rounded-lg border border-gray-200"
              >
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-700">
                    {formatDate(b.date)} · {b.items.length} item
                    {b.items.length > 1 ? "s" : ""}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(b.total)}
                  </span>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {b.items.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2 text-gray-800">
                          {t.product?.name || "-"}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {t.quantity} {t.product?.unit || ""}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatCurrency(t.price_per_unit)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(t.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPurchases.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {t.product?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {t.quantity} {t.product?.unit || ""}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(t.price_per_unit)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(t.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditVendorModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        vendor={vendor}
        onSaved={async () => {
          setEditOpen(false);
          await load();
        }}
      />

      <BulkPurchaseModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        vendor={vendor}
        onSaved={async () => {
          setBulkOpen(false);
          await load();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doDelete}
        title="Delete vendor?"
        message="Delete this vendor? Past purchases are kept but will no longer be linked to this vendor."
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}

// ---- Bulk purchase: add several products from this vendor at once ----
const emptyLine = {
  product_id: "",
  new_name: "",
  quantity: "",
  price_per_unit: "",
  selling_price: "",
};

const todayStr = () => new Date().toISOString().split("T")[0];

function BulkPurchaseModal({ open, onClose, vendor, onSaved }) {
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [discount, setDiscount] = useState("");
  const [transport, setTransport] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      getProducts().then(setProducts).catch(() => {});
      setLines([{ ...emptyLine }]);
      setPurchaseDate(todayStr());
      setDiscount("");
      setTransport("");
      setError("");
    }
  }, [open]);

  const setLine = (i, field, value) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const addLine = () => setLines((rows) => [...rows, { ...emptyLine }]);
  const removeLine = (i) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));

  const lineTotal = (l) => (Number(l.quantity) || 0) * (Number(l.price_per_unit) || 0);
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const grandTotal = Math.max(
    0,
    subtotal - (Number(discount) || 0) + (Number(transport) || 0)
  );

  const lineHasProduct = (l) =>
    (l.product_id && l.product_id !== "__new__") ||
    (l.product_id === "__new__" && l.new_name.trim());

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    const valid = lines.filter(
      (l) => lineHasProduct(l) && Number(l.quantity) > 0 && Number(l.price_per_unit) > 0
    );
    if (valid.length === 0)
      return setError("Add at least one line with product, quantity and cost.");

    setSaving(true);
    try {
      // Create any brand-new products first, then resolve to real ids.
      const resolved = [];
      for (const l of valid) {
        let pid = l.product_id;
        if (pid === "__new__") {
          const created = await createProduct({
            name: l.new_name.trim(),
            product_type: "shop",
            unit: "Piece",
            minimum_stock: 0,
            selling_price: Number(l.selling_price) || null,
          });
          pid = created.id;
        }
        resolved.push({
          product_id: pid,
          quantity: l.quantity,
          price_per_unit: l.price_per_unit,
          selling_price: l.selling_price,
        });
      }

      await addBulkPurchase({
        vendorId: vendor.id,
        vendorName: vendor.name,
        lines: resolved,
        discount: Number(discount) || 0,
        transport: Number(transport) || 0,
        purchaseDate,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Bulk Purchase — ${vendor.name}`} size="lg">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="sm:max-w-xs">
          <label className="mb-1 block text-xs text-gray-500">
            Purchase date
          </label>
          <input
            type="date"
            value={purchaseDate}
            max={todayStr()}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-gray-100 p-2"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs text-gray-500">
                    Product
                  </label>
                  <select
                    value={l.product_id}
                    onChange={(e) => setLine(i, "product_id", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">— Select —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="__new__">➕ Add new product…</option>
                  </select>
                  {l.product_id === "__new__" && (
                    <input
                      value={l.new_name}
                      onChange={(e) => setLine(i, "new_name", e.target.value)}
                      className={inputClass + " mt-1"}
                      placeholder="New product name"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="mt-6 shrink-0 px-1 text-lg text-gray-400 hover:text-red-600"
                  title="Remove"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => setLine(i, "quantity", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Cost ₹</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.price_per_unit}
                    onChange={(e) => setLine(i, "price_per_unit", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Sell ₹</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.selling_price}
                    onChange={(e) => setLine(i, "selling_price", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add another product
        </button>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Discount (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Transport cost (₹)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </div>
        </div>

        <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {Number(discount) > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>−{formatCurrency(Number(discount))}</span>
            </div>
          )}
          {Number(transport) > 0 && (
            <div className="flex justify-between">
              <span>Transport</span>
              <span>+{formatCurrency(Number(transport))}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-amber-200 pt-1 font-semibold">
            <span>Total cost</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Purchase"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function EditVendorModal({ open, onClose, vendor, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && vendor) {
      setForm({
        name: vendor.name || "",
        phone: vendor.phone || "",
        address: vendor.address || "",
        note: vendor.note || "",
      });
    }
  }, [open, vendor]);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name is required.");
    setSaving(true);
    try {
      await updateVendor(vendor.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        note: form.note.trim() || null,
      });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Vendor">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <VendorForm form={form} onChange={handleChange} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
