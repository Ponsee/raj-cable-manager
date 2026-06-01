import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import { LineChart } from "@mui/x-charts/LineChart";
import EditProductModal from "../components/products/EditProductModal";
import StockLossModal from "../components/products/StockLossModal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DateRangePicker, {
  inRange,
  currentMonthRange,
} from "../components/ui/DateRangePicker";
import {
  getProduct,
  getStockTransactions,
  addStockTransaction,
  updateProduct,
  deleteProduct,
} from "../services/productsService";
import { getVendors, createVendor } from "../services/vendorsService";
import { calcStock, isLowStock, pricesByVendor } from "../utils/productCalc";
import { STOCK_TYPES, productTypeLabel } from "../constants";
import { formatCurrency, formatDate } from "../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const typeBadge = {
  purchase: "bg-green-100 text-green-700",
  sale: "bg-blue-100 text-blue-700",
  usage: "bg-purple-100 text-purple-700",
  loss: "bg-red-100 text-red-700",
};
const typeLabel = {
  purchase: "Purchase",
  sale: "Sale",
  usage: "Used in service",
  loss: "Loss / damage",
};

// Which entries each clickable stat card shows. types=null → all movements.
const HISTORY_VIEWS = {
  stock: { title: "Stock movements", types: null },
  value: { title: "Stock value — movements", types: null },
  purchases: { title: "Purchases", types: [STOCK_TYPES.PURCHASE] },
  sales: { title: "Sales", types: [STOCK_TYPES.SALE] },
  profit: { title: "Profit (per sale)", types: [STOCK_TYPES.SALE] },
  loss: { title: "Loss / damage", types: [STOCK_TYPES.LOSS] },
};

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lossOpen, setLossOpen] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState(currentMonthRange());
  const [historyKey, setHistoryKey] = useState(null);
  const [vendorByName, setVendorByName] = useState({}); // name -> id, to link vendors

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        getProduct(id),
        getStockTransactions(id),
      ]);
      setProduct(p);
      setTxs(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  // Map vendor name -> id so the "Prices by vendor" rows can link even when an
  // old purchase didn't store a vendor_id.
  useEffect(() => {
    getVendors()
      .then((vs) => {
        const m = {};
        for (const v of vs) if (v.name) m[v.name.trim().toLowerCase()] = v.id;
        setVendorByName(m);
      })
      .catch(() => {});
  }, []);

  if (loading) return <p className="text-gray-400">Loading product...</p>;
  if (!product) {
    return (
      <div>
        <p className="text-gray-500">Product not found.</p>
        <Link to="/products" className="text-indigo-600">
          ← Back to products
        </Link>
      </div>
    );
  }

  const summary = calcStock(txs);

  // Buy vs sell price over time (from purchase batches, oldest first).
  // Sell falls back to the product's current selling price when a purchase
  // didn't record one, so the sell line still shows.
  const fallbackSell =
    product.selling_price != null ? Number(product.selling_price) : null;
  const priceHistory = txs
    .filter((t) => t.type === STOCK_TYPES.PURCHASE)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((t) => ({
      date: formatDate(t.created_at),
      buy: Number(t.price_per_unit) || 0,
      sell: t.selling_price != null ? Number(t.selling_price) : fallbackSell,
    }));
  const low = isLowStock(summary.stock, product.minimum_stock);
  const vendorPrices = pricesByVendor(txs);

  // Profit margin = selling price vs last purchase cost (per unit).
  const sellPrice = Number(product.selling_price) || 0;
  const unitCost = Number(summary.lastPurchasePrice) || 0;
  const marginPerUnit = sellPrice - unitCost;
  const marginPct = sellPrice > 0 ? (marginPerUnit / sellPrice) * 100 : 0;

  // Each clickable card opens this history with the matching entries.
  const view = historyKey ? HISTORY_VIEWS[historyKey] : null;
  const historyTxs = view
    ? txs.filter((t) => !view.types || view.types.includes(t.type))
    : [];

  const doDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteProduct(id);
      navigate("/products");
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  // Open a small print window with just the QR label.
  const printLabel = () => {
    const canvas = document.getElementById("product-qr");
    const url = canvas?.toDataURL?.();
    if (!url) return;
    const w = window.open("", "_blank", "width=320,height=380");
    if (!w) return;
    w.document.write(
      `<div style="text-align:center;font-family:sans-serif;padding:12px">
         <img src="${url}" style="width:200px;height:200px"/>
         <div style="margin-top:6px;font-weight:600">${product.name}</div>
         ${
           product.subcategory
             ? `<div style="font-size:12px;color:#666">${product.subcategory}</div>`
             : ""
         }
       </div>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  };

  const filteredTxs = txs.filter(
    (t) =>
      (typeFilter === "all" || t.type === typeFilter) &&
      inRange(t.created_at, dateRange.start, dateRange.end)
  );

  return (
    <div>
      <Link
        to="/products"
        className="mb-3 inline-block text-sm text-indigo-600 hover:underline"
      >
        ← Back to products
      </Link>

      <PageHeader
        title={product.name}
        subtitle={`${product.code ? product.code + " · " : ""}${product.category || "Product"} · sold in ${product.unit || "units"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setLossOpen(true)}>
              ⚠️ Report Loss
            </Button>
            <Button onClick={() => setModalOpen(true)}>+ Add Stock Entry</Button>
          </div>
        }
      />

      {low && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ Low stock: only <strong>{summary.stock} {product.unit}</strong> left
          (alert level {product.minimum_stock}).
        </div>
      )}

      {/* Profile + summary */}
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
          {(() => {
            const imgs =
              product.image_urls && product.image_urls.length
                ? product.image_urls
                : product.image_url
                  ? [product.image_url]
                  : [];
            if (!imgs.length) {
              return (
                <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-4xl text-gray-300">
                  📦
                </div>
              );
            }
            const idx = Math.min(activeImg, imgs.length - 1);
            return (
              <div className="mb-3">
                <img
                  src={imgs[idx]}
                  alt={product.name}
                  className="h-40 w-full rounded-lg border border-gray-100 object-cover"
                />
                {imgs.length > 1 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {imgs.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveImg(i)}
                        className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 ${
                          i === idx ? "border-indigo-500" : "border-transparent"
                        }`}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          <dl className="space-y-2 text-sm">
            {product.code && <Row label="Product ID" value={product.code} />}
            <Row label="Use" value={productTypeLabel(product.product_type)} />
            <Row label="Category" value={product.category || "-"} />
            {product.subcategory && (
              <Row label="Brand / sub" value={product.subcategory} />
            )}
            <Row label="Unit" value={product.unit || "-"} />
            <Row label="Low-stock level" value={product.minimum_stock || "-"} />
            {summary.usedQty > 0 && (
              <Row
                label="Used in service"
                value={`${summary.usedQty} ${product.unit || ""}`}
              />
            )}
            {summary.lostQty > 0 && (
              <Row
                label="Lost / damaged"
                value={`${summary.lostQty} ${product.unit || ""}`}
              />
            )}
            <Row
              label="Last purchase price"
              value={
                summary.lastPurchasePrice
                  ? formatCurrency(summary.lastPurchasePrice)
                  : "-"
              }
            />
            <Row
              label="Selling price"
              value={
                product.selling_price
                  ? formatCurrency(product.selling_price)
                  : "-"
              }
            />
          </dl>

          <div className="mt-4 border-t border-gray-100 pt-4 text-center">
            <QRCodeCanvas id="product-qr" value={product.id} size={120} />
            <p className="mt-1 text-xs text-gray-400">Scan this to sell</p>
            <button
              type="button"
              onClick={printLabel}
              className="mt-1 text-sm text-indigo-600 hover:underline"
            >
              🖨️ Print label
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard
            label="Current Stock"
            value={`${summary.stock} ${product.unit || ""}`}
            icon="📦"
            accent={low ? "red" : "indigo"}
            onClick={() => setHistoryKey("stock")}
          />
          <StatCard
            label="Stock Value"
            value={formatCurrency(summary.stockValue)}
            icon="🏷️"
            accent="blue"
            onClick={() => setHistoryKey("value")}
          />
          <StatCard
            label="Total Purchases"
            value={formatCurrency(summary.purchaseValue)}
            icon="🛒"
            accent="amber"
            onClick={() => setHistoryKey("purchases")}
          />
          <StatCard
            label="Total Sales"
            value={formatCurrency(summary.saleValue)}
            icon="💰"
            accent="green"
            onClick={() => setHistoryKey("sales")}
          />
          <StatCard
            label="Lost / Damaged"
            value={`${summary.lostQty || 0} ${product.unit || ""}`}
            icon="⚠️"
            accent="red"
            onClick={() => setHistoryKey("loss")}
          >
            <p className="mt-1 text-xs text-gray-500">
              {summary.lostQty > 0
                ? `approx ${formatCurrency(summary.lossValue)} value`
                : "No losses recorded."}
            </p>
          </StatCard>
          <StatCard
            label="Profit Margin"
            value={sellPrice > 0 ? `${marginPct.toFixed(0)}%` : "—"}
            icon="📈"
            accent={marginPerUnit >= 0 ? "purple" : "red"}
            onClick={() => setHistoryKey("profit")}
          >
            <p className="mt-1 text-xs text-gray-500">
              {sellPrice > 0
                ? `${formatCurrency(marginPerUnit)}/${product.unit || "unit"}`
                : "Set a selling price."}
            </p>
          </StatCard>
        </div>
      </div>

      {/* Price history — buy vs sell over time */}
      {priceHistory.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 font-semibold text-gray-800">Price history</h3>
          <p className="mb-2 text-xs text-gray-400">
            Buy price (cost) vs intended selling price, per purchase.
          </p>
          <div className="overflow-x-auto">
            <LineChart
              height={260}
              xAxis={[
                {
                  scaleType: "point",
                  data: priceHistory.map((_, i) => i),
                  valueFormatter: (i) => priceHistory[i]?.date ?? "",
                },
              ]}
              series={[
                {
                  data: priceHistory.map((p) => p.buy),
                  label: "Buy price",
                  color: "#ef4444",
                  showMark: true,
                },
                {
                  data: priceHistory.map((p) => p.sell),
                  label: "Sell price",
                  color: "#16a34a",
                  showMark: true,
                  connectNulls: true,
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Prices by vendor — cheapest first */}
      {vendorPrices.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-semibold text-gray-800">Prices by vendor</h3>
            <p className="text-xs text-gray-400">
              Cheapest supplier first (based on latest purchase price).
            </p>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Lowest</th>
                  <th className="px-4 py-3 text-right">Latest</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendorPrices.map((v, i) => (
                  <tr key={v.vendor} className={i === 0 ? "bg-green-50" : ""}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {(() => {
                        const vid =
                          v.vendorId ||
                          vendorByName[(v.vendor || "").trim().toLowerCase()];
                        return vid ? (
                          <Link
                            to={`/vendors/${vid}`}
                            className="text-indigo-600 hover:underline"
                          >
                            {v.vendor}
                          </Link>
                        ) : (
                          v.vendor
                        );
                      })()}
                      {i === 0 && (
                        <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                          cheapest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(v.minPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(v.lastPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{v.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-gray-800">Stock History</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All entries</option>
              <option value={STOCK_TYPES.PURCHASE}>Purchases</option>
              <option value={STOCK_TYPES.SALE}>Sales</option>
              <option value={STOCK_TYPES.USAGE}>Used in service</option>
              <option value={STOCK_TYPES.LOSS}>Loss / damage</option>
            </select>
            <DateRangePicker
              start={dateRange.start}
              end={dateRange.end}
              onChange={setDateRange}
            />
          </div>
        </div>
        {filteredTxs.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No stock entries match the filter.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Vendor / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTxs.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge[t.type]}`}
                      >
                        {typeLabel[t.type] || t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {t.quantity}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(t.price_per_unit)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(t.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.vendor_name || t.note || "-"}
                      {t.type === "purchase" && t.selling_price ? (
                        <span className="ml-1 text-xs text-gray-400">
                          · sell @ {formatCurrency(t.selling_price)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StockHistoryModal
        open={!!historyKey}
        onClose={() => setHistoryKey(null)}
        title={view?.title || ""}
        txs={historyTxs}
        profitCost={historyKey === "profit" ? unitCost : null}
      />

      <AddStockModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={product}
        currentStock={summary.stock}
        onSaved={async () => {
          setModalOpen(false);
          await load();
        }}
      />

      <EditProductModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        product={product}
        onSaved={async () => {
          setEditOpen(false);
          await load();
        }}
      />

      <StockLossModal
        open={lossOpen}
        onClose={() => setLossOpen(false)}
        product={{ ...product, stock: summary.stock }}
        onSaved={async () => {
          setLossOpen(false);
          await load();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doDelete}
        title="Delete product?"
        message={`Delete "${product.name}"? Its stock history will be removed. This cannot be undone.`}
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}

// History popup opened from a stat card. Has its own date range + scroll.
// When profitCost is set (a per-unit cost), it shows a Profit column for sales.
function StockHistoryModal({ open, onClose, title, txs, profitCost = null }) {
  const [range, setRange] = useState(currentMonthRange());

  useEffect(() => {
    if (open) setRange(currentMonthRange());
  }, [open]);

  const showProfit = profitCost != null;
  const profitOf = (t) =>
    (Number(t.total_amount) || 0) - (Number(t.quantity) || 0) * profitCost;

  const rows = txs.filter((t) => inRange(t.created_at, range.start, range.end));
  const total = rows.reduce(
    (s, t) => s + (showProfit ? profitOf(t) : Number(t.total_amount) || 0),
    0
  );

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-3">
        <DateRangePicker
          start={range.start}
          end={range.end}
          onChange={setRange}
        />
        {rows.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No entries in this range.
          </p>
        ) : (
          <>
            <div className="max-h-[24rem] overflow-auto rounded-lg border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    {showProfit ? (
                      <th className="px-3 py-2 text-right">Profit</th>
                    ) : (
                      <th className="px-3 py-2">Vendor / Note</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 text-gray-600">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge[t.type]}`}
                        >
                          {typeLabel[t.type] || t.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {t.quantity}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {formatCurrency(t.price_per_unit)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                        {formatCurrency(t.total_amount)}
                      </td>
                      {showProfit ? (
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            profitOf(t) >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(profitOf(t))}
                        </td>
                      ) : (
                        <td className="px-3 py-2 text-gray-600">
                          {t.vendor_name || t.note || "-"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
              <span>{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
              <span>
                {showProfit ? "Total profit" : "Total"}: {formatCurrency(total)}
              </span>
            </div>
            {showProfit && (
              <p className="text-xs text-gray-400">
                Profit = sale total − (qty × cost {formatCurrency(profitCost)}).
                Cost basis is the last purchase price.
              </p>
            )}
          </>
        )}
      </div>
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

// ---- Add Purchase / Sale ----
function AddStockModal({ open, onClose, product, currentStock, onSaved }) {
  const [type, setType] = useState(STOCK_TYPES.PURCHASE);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [note, setNote] = useState("");
  const [vendors, setVendors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      getVendors().then(setVendors).catch(() => {});
      setSellingPrice(product.selling_price ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const qty = Number(quantity) || 0;
  const rate = Number(price) || 0;
  const total = qty * rate;

  const reset = () => {
    setType(STOCK_TYPES.PURCHASE);
    setQuantity("");
    setPrice("");
    setSellingPrice(product.selling_price ?? "");
    setVendorId("");
    setNewVendorName("");
    setNote("");
    setError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const usage = type === STOCK_TYPES.USAGE;
    const stockOut = type === STOCK_TYPES.SALE || usage;
    if (qty <= 0) return setError("Quantity must be greater than 0.");
    if (!usage && rate <= 0) return setError("Rate must be greater than 0.");
    if (stockOut && qty > currentStock)
      return setError(
        `Not enough stock. Only ${currentStock} ${product.unit} available.`
      );

    setSaving(true);
    try {
      // Resolve the vendor (purchases only): existing, brand-new, or none.
      let vendor_id = null;
      let vendor_name = null;
      if (type === STOCK_TYPES.PURCHASE) {
        if (vendorId === "__new__") {
          const name = newVendorName.trim();
          if (!name) {
            setSaving(false);
            return setError("Enter the new vendor's name.");
          }
          const created = await createVendor({ name });
          vendor_id = created.id;
          vendor_name = created.name;
        } else if (vendorId) {
          const v = vendors.find((x) => x.id === vendorId);
          vendor_id = vendorId;
          vendor_name = v?.name || null;
        }
      }

      const payload = {
        product_id: product.id,
        type,
        quantity: qty,
        price_per_unit: usage ? 0 : rate,
        // Selling price is recorded per purchase (can differ each batch).
        selling_price:
          type === STOCK_TYPES.PURCHASE ? Number(sellingPrice) || null : null,
        total_amount: usage ? 0 : total,
        vendor_id,
        vendor_name,
        note: note.trim() || null,
      };

      await addStockTransaction(payload, { productName: product.name });
      // On a purchase, save/refresh the product's selling price if entered.
      if (type === STOCK_TYPES.PURCHASE && Number(sellingPrice) > 0) {
        await updateProduct(product.id, {
          selling_price: Number(sellingPrice),
        });
      }
      reset();
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const isPurchase = type === STOCK_TYPES.PURCHASE;
  const isUsage = type === STOCK_TYPES.USAGE;
  const stockOptions = [
    { v: STOCK_TYPES.PURCHASE, icon: "🛒", label: "Purchase" },
    { v: STOCK_TYPES.SALE, icon: "💰", label: "Sale" },
    { v: STOCK_TYPES.USAGE, icon: "🔧", label: "Used in service" },
  ];
  const helpText = isPurchase
    ? "Buying stock — adds to inventory and records an Expense."
    : isUsage
    ? `Used for a service job — removes from inventory. No income. Available: ${currentStock} ${product.unit}.`
    : `Selling stock — removes from inventory and records an Income. Available: ${currentStock} ${product.unit}.`;

  return (
    <Modal open={open} onClose={onClose} title="Add Stock Entry">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Type selector */}
        <div className="grid grid-cols-3 gap-2">
          {stockOptions.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => {
                setType(o.v);
                setVendorId("");
                setNewVendorName("");
                setError("");
                // Pre-fill the sale price from the product's selling price.
                setPrice(
                  o.v === STOCK_TYPES.SALE && product.selling_price
                    ? String(product.selling_price)
                    : ""
                );
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-xs font-medium transition ${
                type === o.v
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="text-xl">{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>

        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {helpText}
        </p>

        <Field label={`Quantity (${product.unit})`}>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
            placeholder="e.g. 10"
          />
        </Field>

        {!isUsage && (
          <Field
            label={
              isPurchase ? "Purchase price per unit (₹)" : "Selling price per unit (₹)"
            }
          >
            <input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>
        )}

        {isPurchase && (
          <Field label="Selling price per unit (₹)">
            <input
              type="number"
              min="0"
              step="any"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className={inputClass}
              placeholder="What you'll sell it for"
            />
            <p className="mt-1 text-xs text-gray-400">
              Saved on the product and used to pre-fill Sales.
            </p>
          </Field>
        )}

        {isPurchase && (
          <Field label="Vendor">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className={inputClass}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value="__new__">➕ Add new vendor…</option>
            </select>
            {vendorId === "__new__" && (
              <input
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                className={inputClass + " mt-2"}
                placeholder="New vendor name"
                autoFocus
              />
            )}
          </Field>
        )}

        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>

        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isPurchase
              ? "bg-amber-50 text-amber-800"
              : isUsage
              ? "bg-purple-50 text-purple-800"
              : "bg-green-50 text-green-800"
          }`}
        >
          {isUsage ? (
            <>
              Removes <strong>{qty} {product.unit}</strong> from stock (no income)
            </>
          ) : (
            <>
              {isPurchase ? "Total cost" : "Total sale"}:{" "}
              <strong>{formatCurrency(total)}</strong>
            </>
          )}
        </div>

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

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}
