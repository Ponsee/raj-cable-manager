import { useState } from "react";
import { PRODUCT_CATEGORIES, PRODUCT_TYPES } from "../../constants";
import ProductImages from "../products/ProductImages";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Common units of measure for stock.
export const PRODUCT_UNITS = ["Piece", "Meter", "Roll", "Box", "Set", "Pair"];

// Blank form values for a new product.
export const emptyProductForm = {
  name: "",
  code: "",
  product_type: PRODUCT_TYPES.SHOP,
  category: PRODUCT_CATEGORIES[0],
  subcategory: "",
  unit: PRODUCT_UNITS[0],
  selling_price: "",
  minimum_stock: "",
};

// Shared fields for both "Add product" and "Edit product".
// Parent owns the state (`form`) + submit. Images: parent passes the existing
// `imageUrls` + newly-picked `imageFiles` and their setters (see ProductImages).
export default function ProductForm({
  form,
  onChange,
  categorySuggestions = [],
  subcategorySuggestions = [],
  imageUrls = [],
  imageFiles = [],
  onImageUrlsChange,
  onImageFilesChange,
  codeHint,
}) {
  const [addingCat, setAddingCat] = useState(false);
  const allCategories = [
    ...new Set([...PRODUCT_CATEGORIES, ...categorySuggestions, form.category].filter(Boolean)),
  ];
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Product name *
        </label>
        <input
          name="name"
          required
          value={form.name}
          onChange={onChange}
          className={inputClass}
          placeholder="e.g. TCCL remote"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Product code
        </label>
        <input
          name="code"
          value={form.code || ""}
          onChange={onChange}
          className={inputClass}
          placeholder={codeHint || "Auto (e.g. CAB001)"}
        />
        <p className="mt-1 text-xs text-gray-400">
          {codeHint
            ? `Leave blank to auto-assign ${codeHint}.`
            : "Leave blank and we'll create one from the category (e.g. CAB001)."}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Product use
        </label>
        <select
          name="product_type"
          value={form.product_type}
          onChange={onChange}
          className={inputClass}
        >
          <option value={PRODUCT_TYPES.SHOP}>Shop product (for resale)</option>
          <option value={PRODUCT_TYPES.SERVICE}>
            Service material (used for cable work)
          </option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Category
          </label>
          {addingCat ? (
            <div className="flex gap-2">
              <input
                name="category"
                value={form.category}
                onChange={onChange}
                className={inputClass}
                placeholder="New category"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setAddingCat(false)}
                className="shrink-0 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50"
              >
                List
              </button>
            </div>
          ) : (
            <select
              value={form.category}
              onChange={(e) => {
                if (e.target.value === "__add__") {
                  setAddingCat(true);
                  onChange({ target: { name: "category", value: "" } });
                } else {
                  onChange(e);
                }
              }}
              className={inputClass}
            >
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__add__">➕ Add new…</option>
            </select>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Sub-category / brand
          </label>
          <input
            name="subcategory"
            list="subcategoryList"
            value={form.subcategory}
            onChange={onChange}
            className={inputClass}
            placeholder="e.g. TCCL, Airtel"
          />
          <datalist id="subcategoryList">
            {subcategorySuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Unit
          </label>
          <select
            name="unit"
            value={form.unit}
            onChange={onChange}
            className={inputClass}
          >
            {PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Low-stock alert level
          </label>
          <input
            name="minimum_stock"
            type="number"
            min="0"
            value={form.minimum_stock}
            onChange={onChange}
            className={inputClass}
            placeholder="0 = no alert"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Selling price per unit (₹)
        </label>
        <input
          name="selling_price"
          type="number"
          min="0"
          value={form.selling_price}
          onChange={onChange}
          className={inputClass}
          placeholder="Price you sell to customers"
        />
      </div>

      <ProductImages
        urls={imageUrls}
        files={imageFiles}
        onUrlsChange={onImageUrlsChange}
        onFilesChange={onImageFilesChange}
      />
    </div>
  );
}
