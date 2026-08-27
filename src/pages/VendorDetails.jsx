import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DateRangePicker, {
  inRange,
  lastMonthsRange,
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
  deletePurchaseBatch,
} from "../services/productsService";
import { formatCurrency, formatDate } from "../utils/format";
import { PAYMENT_METHODS_SPLIT, PAYMENT_SPLIT } from "../constants";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import MuiTextField from "@mui/material/TextField";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { renderProductOption } from "../components/products/ProductPicker";

const productFilter = createFilterOptions();

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
  return [...map.entries()].map(([key, items]) => {
    const subtotal = items.reduce((s, t) => s + (Number(t.total_amount) || 0), 0);
    const discount = items.reduce((s, t) => s + (Number(t.discount) || 0), 0);
    const transport = items.reduce((s, t) => s + (Number(t.transport) || 0), 0);
    return {
      key,
      date: key,
      items,
      subtotal,
      discount,
      transport,
      total: subtotal - discount + transport,
    };
  });
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
  const [dateRange, setDateRange] = useState(lastMonthsRange(6));
  const [viewMode, setViewMode] = useState("batch"); // "batch" | "list"
  const [confirmBatch, setConfirmBatch] = useState(null); // purchase batch to delete
  const [deletingBatch, setDeletingBatch] = useState(false);

  const doDeleteBatch = async () => {
    setDeletingBatch(true);
    try {
      await deletePurchaseBatch(confirmBatch.items);
      setConfirmBatch(null);
      await load();
    } finally {
      setDeletingBatch(false);
    }
  };

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

  // Frequently bought — over the last 6 months (fixed window, ignores the filter
  // above). Grouped per product: how often it was bought, total qty, and the most
  // recent buying price. Sorted by how often it's bought.
  const freqWindow = lastMonthsRange(6);
  const freqBought = (() => {
    const byProduct = new Map();
    for (const t of purchases) {
      if (!inRange(t.created_at, freqWindow.start, freqWindow.end)) continue;
      const key = t.product_id || t.product?.name;
      if (!key) continue;
      const cur = byProduct.get(key) || {
        key,
        product_id: t.product_id,
        name: t.product?.name || "-",
        unit: t.product?.unit || "",
        count: 0,
        qty: 0,
        lastPrice: null,
        lastDate: null,
      };
      cur.count += 1;
      cur.qty += Number(t.quantity) || 0;
      if (!cur.lastDate || t.created_at > cur.lastDate) {
        cur.lastDate = t.created_at;
        cur.lastPrice = t.price_per_unit;
      }
      byProduct.set(key, cur);
    }
    return [...byProduct.values()]
      .sort((a, b) => b.count - a.count || b.qty - a.qty)
      .slice(0, 8);
  })();

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

      {/* Frequently bought — last 6 months, with the latest buying price */}
      {freqBought.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-semibold text-gray-800">
              🔁 Frequently bought{" "}
              <span className="font-normal text-gray-400">(last 6 months)</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Times bought</th>
                  <th className="px-4 py-2 text-right">Total qty</th>
                  <th className="px-4 py-2 text-right">Latest price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {freqBought.map((f) => (
                  <tr key={f.key}>
                    <td className="px-4 py-2 text-gray-800">
                      {f.product_id ? (
                        <Link
                          to={`/products/${f.product_id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {f.name}
                        </Link>
                      ) : (
                        f.name
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {f.count}×
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {f.qty} {f.unit}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">
                      {formatCurrency(f.lastPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(b.total)}
                    </span>
                    <Tooltip title="Delete this purchase (also removes its stock & expense)">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setConfirmBatch(b)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {b.items.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2 text-gray-800">
                          {t.product_id ? (
                            <Link
                              to={`/products/${t.product_id}`}
                              className="text-indigo-600 hover:underline"
                            >
                              {t.product?.name || "-"}
                            </Link>
                          ) : (
                            t.product?.name || "-"
                          )}
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
                {(b.discount > 0 || b.transport > 0) && (
                  <div className="space-y-0.5 border-t border-gray-100 bg-gray-50/50 px-3 py-2 text-sm">
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal</span>
                      <span>{formatCurrency(b.subtotal)}</span>
                    </div>
                    {b.discount > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>Discount</span>
                        <span>− {formatCurrency(b.discount)}</span>
                      </div>
                    )}
                    {b.transport > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>Transport</span>
                        <span>+ {formatCurrency(b.transport)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
                      <span>Net</span>
                      <span>{formatCurrency(b.total)}</span>
                    </div>
                  </div>
                )}
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
                      {t.product_id ? (
                        <Link
                          to={`/products/${t.product_id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {t.product?.name || "-"}
                        </Link>
                      ) : (
                        t.product?.name || "-"
                      )}
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

      <ConfirmDialog
        open={!!confirmBatch}
        onClose={() => setConfirmBatch(null)}
        onConfirm={doDeleteBatch}
        title={
          confirmBatch
            ? `Delete this purchase (${confirmBatch.items.length} item${
                confirmBatch.items.length > 1 ? "s" : ""
              })?`
            : "Delete purchase?"
        }
        message="This removes the stock received in this purchase (product stock goes down accordingly) AND its expense entry. This cannot be undone."
        confirmLabel="Delete purchase"
        loading={deletingBatch}
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
  total_cost: "", // line total (qty × cost) — entering it back-fills the cost
  selling_price: "",
};

const round2 = (n) => Math.round(n * 100) / 100;

const todayStr = () => new Date().toISOString().split("T")[0];

export function BulkPurchaseModal({ open, onClose, vendor, onSaved, title, onBack }) {
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [discount, setDiscount] = useState("");
  const [transport, setTransport] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS_SPLIT[0]); // Cash by default
  const [cashAmount, setCashAmount] = useState(""); // for Split
  const [onlineAmount, setOnlineAmount] = useState(""); // for Split
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      getProducts().then(setProducts).catch(() => {});
      setLines([{ ...emptyLine }]);
      setPurchaseDate(todayStr());
      setDiscount("");
      setTransport("");
      setPaymentMethod(PAYMENT_METHODS_SPLIT[0]);
      setCashAmount("");
      setOnlineAmount("");
      setError("");
    }
  }, [open]);

  const setLine = (i, field, value) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  // Qty / Cost / Total are linked: total = qty × cost. Editing any one keeps the
  // other in sync — enter Qty 10 + Total 300 and Cost fills to 30, and vice versa.
  const setLineMoney = (i, field, value) =>
    setLines((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, [field]: value };
        const qty = Number(next.quantity) || 0;
        const hasCost = next.price_per_unit !== "" && !isNaN(Number(next.price_per_unit));
        if (field === "quantity") {
          if (hasCost) next.total_cost = qty ? String(round2(qty * Number(next.price_per_unit))) : "";
          else if (next.total_cost !== "")
            next.price_per_unit = qty ? String(round2(Number(next.total_cost) / qty)) : "";
        } else if (field === "price_per_unit") {
          next.total_cost = qty && value !== "" ? String(round2(qty * Number(value))) : next.total_cost;
        } else if (field === "total_cost") {
          next.price_per_unit = qty && value !== "" ? String(round2(Number(value) / qty)) : next.price_per_unit;
        }
        return next;
      })
    );
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

    // Split payment: Cash + Online must add up to the order total.
    let cashAmt = 0;
    let onlineAmt = 0;
    if (paymentMethod === PAYMENT_SPLIT) {
      cashAmt = Number(cashAmount) || 0;
      onlineAmt = Number(onlineAmount) || 0;
      if (Math.round(cashAmt + onlineAmt) !== Math.round(grandTotal))
        return setError(
          `Cash + Online must add up to ${formatCurrency(grandTotal)}.`
        );
    }

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
        paymentMethod,
        cashAmount: cashAmt,
        onlineAmount: onlineAmt,
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
    <Modal
      open={open}
      onClose={onClose}
      title={title || `Bulk Purchase — ${vendor.name}`}
      size="lg"
    >
      <form onSubmit={handleSave} className="space-y-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back
          </button>
        )}
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
                  <Autocomplete
                    freeSolo
                    selectOnFocus
                    handleHomeEndKeys
                    options={products}
                    value={
                      l.product_id && l.product_id !== "__new__"
                        ? products.find((p) => p.id === l.product_id) || null
                        : l.product_id === "__new__"
                          ? { __new: true, inputValue: l.new_name, name: l.new_name }
                          : null
                    }
                    onChange={(_e, val) => {
                      if (val && typeof val === "object" && val.__new) {
                        setLine(i, "product_id", "__new__");
                        setLine(i, "new_name", val.inputValue);
                      } else if (val && typeof val === "object") {
                        setLine(i, "product_id", val.id);
                        setLine(i, "new_name", "");
                      } else if (typeof val === "string" && val.trim()) {
                        setLine(i, "product_id", "__new__");
                        setLine(i, "new_name", val.trim());
                      } else {
                        setLine(i, "product_id", "");
                        setLine(i, "new_name", "");
                      }
                    }}
                    filterOptions={(options, params) => {
                      const filtered = productFilter(options, params);
                      const input = params.inputValue.trim();
                      const exists = options.some(
                        (o) => o.name?.toLowerCase() === input.toLowerCase()
                      );
                      if (input && !exists) {
                        filtered.push({
                          __new: true,
                          inputValue: input,
                          name: `➕ Add new product "${input}"`,
                        });
                      }
                      return filtered;
                    }}
                    getOptionLabel={(p) =>
                      typeof p === "string"
                        ? p
                        : p.__new
                          ? p.inputValue
                          : p.name || ""
                    }
                    isOptionEqualToValue={(o, v) => o.id === v?.id}
                    renderOption={(props, p) => {
                      if (p.__new) {
                        const { key, ...rest } = props;
                        return (
                          <li
                            key={key}
                            {...rest}
                            className="font-medium text-indigo-600"
                          >
                            {p.name}
                          </li>
                        );
                      }
                      return renderProductOption(props, p);
                    }}
                    size="small"
                    renderInput={(params) => (
                      <MuiTextField
                        {...params}
                        label="Product"
                        placeholder="Search or add new…"
                      />
                    )}
                  />
                  {l.product_id === "__new__" && l.new_name.trim() && (
                    <p className="mt-1 text-xs text-indigo-600">
                      ➕ New product “{l.new_name}” will be created.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="mt-1.5 shrink-0 px-1 text-lg text-gray-400 hover:text-red-600"
                  title="Remove"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => setLineMoney(i, "quantity", e.target.value)}
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
                    onChange={(e) => setLineMoney(i, "price_per_unit", e.target.value)}
                    className={inputClass}
                    placeholder="per unit"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Total ₹</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.total_cost}
                    onChange={(e) => setLineMoney(i, "total_cost", e.target.value)}
                    className={inputClass}
                    placeholder="qty × cost"
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

        {/* Paid via — Cash / Online / Split (recorded on the combined expense) */}
        <div>
          <label className="mb-1 block text-xs text-gray-500">Paid via</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS_SPLIT.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  paymentMethod === m
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {paymentMethod === PAYMENT_SPLIT && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Cash (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="any"
                  value={cashAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCashAmount(v);
                    // Auto-fill the Online part as whatever's left of the total.
                    setOnlineAmount(
                      String(Math.max(0, grandTotal - (Number(v) || 0)))
                    );
                  }}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Online (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="any"
                  value={onlineAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOnlineAmount(v);
                    // Auto-fill the Cash part as whatever's left of the total.
                    setCashAmount(
                      String(Math.max(0, grandTotal - (Number(v) || 0)))
                    );
                  }}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <p className="col-span-2 text-xs text-gray-500">
                Should add up to {formatCurrency(grandTotal)} — entered{" "}
                {formatCurrency(
                  (Number(cashAmount) || 0) + (Number(onlineAmount) || 0)
                )}
                .
              </p>
            </div>
          )}
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
          {paymentMethod === PAYMENT_SPLIT && (
            <div className="border-t border-amber-200 pt-1">
              <div className="flex justify-between">
                <span>💵 Cash</span>
                <span>{formatCurrency(Number(cashAmount) || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>📱 Online</span>
                <span>{formatCurrency(Number(onlineAmount) || 0)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
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
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
