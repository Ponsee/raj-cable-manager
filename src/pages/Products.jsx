import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ProductForm, { emptyProductForm } from "../components/forms/ProductForm";
import ScanToSellModal from "../components/products/ScanToSellModal";
import OpeningStockModal from "../components/products/OpeningStockModal";
import EditProductModal from "../components/products/EditProductModal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import {
  getProductsWithStock,
  createProduct,
  deleteProduct,
  getSubcategorySuggestions,
  getCategorySuggestions,
  uploadProductImage,
} from "../services/productsService";
import { PRODUCT_CATEGORIES, PRODUCT_TYPES, productTypeLabel } from "../constants";
import { formatCurrency } from "../utils/format";
import { isLowStock } from "../utils/productCalc";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState(emptyProductForm);
  const [imageFiles, setImageFiles] = useState([]);
  const [subcats, setSubcats] = useState([]);
  const [cats, setCats] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setProducts(await getProductsWithStock());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getSubcategorySuggestions().then(setSubcats).catch(() => {});
    getCategorySuggestions().then(setCats).catch(() => {});
  }, []);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const image_urls = [];
      for (const f of imageFiles) image_urls.push(await uploadProductImage(f));
      await createProduct({
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        product_type: form.product_type,
        category: form.category,
        subcategory: form.subcategory.trim() || null,
        unit: form.unit,
        selling_price: Number(form.selling_price) || null,
        minimum_stock: Number(form.minimum_stock) || 0,
        image_url: image_urls[0] || null,
        image_urls: image_urls.length ? image_urls : null,
      });
      setModalOpen(false);
      setForm(emptyProductForm);
      setImageFiles([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteProduct(confirmTarget.id);
      setConfirmTarget(null);
      await load();
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Filter options include built-in categories + any category in use (incl. new ones).
  const categoryOptions = [
    ...new Set([...PRODUCT_CATEGORIES, ...products.map((p) => p.category).filter(Boolean)]),
  ];

  // Top sellers (by all-time units sold) get a badge in the list.
  const bestSellerIds = new Set(
    [...products]
      .filter((p) => (p.soldQty || 0) > 0)
      .sort((a, b) => (b.soldQty || 0) - (a.soldQty || 0))
      .slice(0, 5)
      .map((p) => p.id)
  );

  const filtered = products.filter((p) => {
    const matchesCategory =
      categoryFilter === "all" || p.category === categoryFilter;
    const matchesType =
      typeFilter === "all" ||
      (p.product_type || "").split(",").includes(typeFilter);
    const matchesSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.subcategory?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesType && matchesSearch;
  })
    // Best sellers first (by all-time units sold); ties keep newest-first order.
    .sort((a, b) => (b.soldQty || 0) - (a.soldQty || 0));

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Inventory & stock"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOpeningOpen(true)}>
              📦 Opening Stock
            </Button>
            <Button variant="secondary" onClick={() => setScanOpen(true)}>
              📷 Scan to Sell
            </Button>
            <Button onClick={() => setModalOpen(true)}>+ Add Product</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          className={inputClass + " sm:max-w-xs"}
          placeholder="Search name or brand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={inputClass + " sm:w-44"}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All uses</option>
          <option value={PRODUCT_TYPES.SHOP}>Shop products</option>
          <option value={PRODUCT_TYPES.SERVICE}>Service materials</option>
        </select>
        <select
          className={inputClass + " sm:w-44"}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-400">Loading products...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No products yet. Click "Add Product" to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Use</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Last Price</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const low = isLowStock(p.stock, p.minimum_stock);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                              📦
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">
                              {p.name}
                              {p.code && (
                                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                                  {p.code}
                                </span>
                              )}
                              {bestSellerIds.has(p.id) && (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                  🔥 Best seller
                                </span>
                              )}
                            </p>
                            {p.subcategory && (
                              <p className="truncate text-xs text-gray-400">
                                {p.subcategory}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {productTypeLabel(p.product_type)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.category || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold ${
                            low ? "text-red-600" : "text-gray-800"
                          }`}
                        >
                          {p.stock} {p.unit || ""}
                        </span>
                        {low && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                            Low
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {p.lastPurchasePrice ? formatCurrency(p.lastPurchasePrice) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditProduct(p);
                          }}
                          className="text-sm text-indigo-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteError("");
                            setConfirmTarget(p);
                          }}
                          className="ml-3 text-sm text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Product modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Product"
        size="lg"
      >
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
            imageFiles={imageFiles}
            onImageFilesChange={setImageFiles}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? "Saving..." : "Save Product"}
            </Button>
          </div>
        </form>
      </Modal>

      <ScanToSellModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onSold={load}
      />

      <OpeningStockModal
        open={openingOpen}
        onClose={() => setOpeningOpen(false)}
        onSaved={async () => {
          setOpeningOpen(false);
          await load();
        }}
      />

      <EditProductModal
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        product={editProduct}
        onSaved={async () => {
          setEditProduct(null);
          await load();
        }}
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={doDelete}
        title="Delete product?"
        message={`Delete "${confirmTarget?.name}"? Its stock history will be removed. This cannot be undone.`}
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}
