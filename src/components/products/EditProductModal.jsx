import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import ProductForm from "../forms/ProductForm";
import {
  updateProduct,
  getSubcategorySuggestions,
  getCategorySuggestions,
  uploadProductImage,
} from "../../services/productsService";

// Shared "Edit product" dialog used by both the list and the details page.
export default function EditProductModal({ open, onClose, product, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    product_type: "",
    category: "",
    subcategory: "",
    unit: "",
    selling_price: "",
    minimum_stock: "",
  });
  const [imageUrls, setImageUrls] = useState([]); // existing (kept) images
  const [imageFiles, setImageFiles] = useState([]); // newly added
  const [subcats, setSubcats] = useState([]);
  const [cats, setCats] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && product) {
      setForm({
        name: product.name || "",
        code: product.code || "",
        product_type: product.product_type || "shop",
        category: product.category || "",
        subcategory: product.subcategory || "",
        unit: product.unit || "",
        selling_price: product.selling_price ?? "",
        minimum_stock: product.minimum_stock ?? "",
      });
      // Prefer the full list; fall back to the single image_url for old rows.
      const urls =
        product.image_urls && product.image_urls.length
          ? product.image_urls
          : product.image_url
            ? [product.image_url]
            : [];
      setImageUrls(urls);
      setImageFiles([]);
      getSubcategorySuggestions().then(setSubcats).catch(() => {});
      getCategorySuggestions().then(setCats).catch(() => {});
    }
  }, [open, product]);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name is required.");
    setSaving(true);
    try {
      const uploaded = [];
      for (const f of imageFiles) uploaded.push(await uploadProductImage(f));
      const allUrls = [...imageUrls, ...uploaded];
      await updateProduct(product.id, {
        name: form.name.trim(),
        code: form.code?.trim() || null,
        product_type: form.product_type,
        category: form.category,
        subcategory: form.subcategory.trim() || null,
        unit: form.unit,
        selling_price: Number(form.selling_price) || null,
        minimum_stock: Number(form.minimum_stock) || 0,
        image_url: allUrls[0] || null,
        image_urls: allUrls,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Product" size="lg">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <ProductForm
          form={form}
          onChange={handleChange}
          categorySuggestions={cats}
          subcategorySuggestions={subcats}
          imageUrls={imageUrls}
          imageFiles={imageFiles}
          onImageUrlsChange={setImageUrls}
          onImageFilesChange={setImageFiles}
        />
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
