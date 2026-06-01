import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
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
          Product use <span className="font-normal text-gray-400">(pick one or both)</span>
        </label>
        <ToggleButtonGroup
          size="small"
          color="primary"
          value={(form.product_type || "").split(",").filter(Boolean)}
          onChange={(_e, vals) => {
            // keep at least one selected
            const next = vals.length ? vals : (form.product_type || "").split(",").filter(Boolean);
            onChange({ target: { name: "product_type", value: next.join(",") } });
          }}
        >
          <ToggleButton value={PRODUCT_TYPES.SHOP} sx={{ textTransform: "none" }}>
            Shop product (resale)
          </ToggleButton>
          <ToggleButton value={PRODUCT_TYPES.SERVICE} sx={{ textTransform: "none" }}>
            Service material
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Category
          </label>
          <Autocomplete
            freeSolo
            options={allCategories}
            value={form.category || ""}
            inputValue={form.category || ""}
            onInputChange={(_e, val) =>
              onChange({ target: { name: "category", value: val } })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="Pick or type a category"
              />
            )}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Sub-category / brand
          </label>
          <Autocomplete
            freeSolo
            options={subcategorySuggestions}
            value={form.subcategory || ""}
            inputValue={form.subcategory || ""}
            onInputChange={(_e, val) =>
              onChange({ target: { name: "subcategory", value: val } })
            }
            renderInput={(params) => (
              <TextField {...params} size="small" placeholder="e.g. TCCL, Airtel" />
            )}
          />
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
