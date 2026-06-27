// Bulk "Opening Stock" entry — record the quantities you already had on the
// shelf when you started using the system. Adds stock with NO expense; buying
// price and vendor are optional. One row per product (with inline "add new").
import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import MuiTextField from "@mui/material/TextField";
import { renderProductOption } from "./ProductPicker";
import {
  getProducts,
  createProduct,
  addOpeningStockBatch,
} from "../../services/productsService";
import { getVendors } from "../../services/vendorsService";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const todayStr = () => new Date().toISOString().split("T")[0];
const productFilter = createFilterOptions();

const emptyLine = {
  product_id: "",
  new_name: "",
  quantity: "",
  price_per_unit: "",
  selling_price: "",
  vendor_id: "",
};

export default function OpeningStockModal({ open, onClose, onSaved }) {
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [asOfDate, setAsOfDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      getProducts().then(setProducts).catch(() => {});
      getVendors().then(setVendors).catch(() => {});
      setLines([{ ...emptyLine }]);
      setAsOfDate(todayStr());
      setError("");
    }
  }, [open]);

  const setLine = (i, field, value) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const addLine = () => setLines((rows) => [...rows, { ...emptyLine }]);
  const removeLine = (i) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));

  const lineHasProduct = (l) =>
    (l.product_id && l.product_id !== "__new__") ||
    (l.product_id === "__new__" && l.new_name.trim());

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    const valid = lines.filter((l) => lineHasProduct(l) && Number(l.quantity) > 0);
    if (valid.length === 0)
      return setError("Add at least one product with a quantity.");

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
        const vendor = vendors.find((v) => v.id === l.vendor_id);
        resolved.push({
          product_id: pid,
          quantity: l.quantity,
          price_per_unit: l.price_per_unit,
          selling_price: l.selling_price,
          vendor_id: l.vendor_id || null,
          vendor_name: vendor?.name || null,
        });
      }

      await addOpeningStockBatch({ lines: resolved, asOfDate });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Opening Stock" size="lg">
      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          📦 Set the stock you already have on the shelf. This adds to inventory
          with <strong>no expense</strong>. Buying price &amp; vendor are optional
          — leave them blank if you don't know.
        </p>

        <div>
          <label className="mb-1 block text-xs text-gray-500">
            As-of date (applies to all)
          </label>
          <input
            type="date"
            value={asOfDate}
            max={todayStr()}
            onChange={(e) => setAsOfDate(e.target.value)}
            className={inputClass + " sm:max-w-xs"}
          />
        </div>

        <div className="max-h-[26rem] space-y-2 overflow-auto pr-1">
          {lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Autocomplete
                    options={products}
                    freeSolo
                    value={products.find((p) => p.id === l.product_id) || null}
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
                      typeof p === "string" ? p : p.__new ? p.inputValue : p.name || ""
                    }
                    isOptionEqualToValue={(o, v) => o.id === v?.id}
                    renderOption={(props, p) => {
                      if (p.__new) {
                        const { key, ...rest } = props;
                        return (
                          <li key={key} {...rest} className="font-medium text-indigo-600">
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
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="mt-1.5 shrink-0 px-1 text-lg text-gray-400 hover:text-red-600"
                    title="Remove"
                  >
                    ×
                  </button>
                )}
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
                  <label className="mb-1 block text-xs text-gray-500">
                    Buy ₹ (opt.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.price_per_unit}
                    onChange={(e) => setLine(i, "price_per_unit", e.target.value)}
                    className={inputClass}
                    placeholder="—"
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

              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Vendor (optional)
                </label>
                <select
                  value={l.vendor_id}
                  onChange={(e) => setLine(i, "vendor_id", e.target.value)}
                  className={inputClass}
                >
                  <option value="">— none —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
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

        <div className="flex justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
          <span>
            {lines.filter(lineHasProduct).length} product
            {lines.filter(lineHasProduct).length === 1 ? "" : "s"}
          </span>
          <span>Total qty {totalQty}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Save opening stock"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
