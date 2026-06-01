// All product/stock math in one place. Stock is ALWAYS derived from the
// purchase/sale history (Business Rule 2) — never stored or edited directly.
import { STOCK_TYPES } from "../constants";
import { formatCurrency } from "./format";

// Roll up a product's stock_transactions into the numbers we show.
export function calcStock(transactions = []) {
  let purchasedQty = 0;
  let soldQty = 0;
  let usedQty = 0; // consumed in service work
  let lostQty = 0; // written off: damaged / missing / returned
  let purchaseValue = 0; // ₹ spent buying
  let saleValue = 0; // ₹ earned selling
  let lossValue = 0; // ₹ value lost (at last cost)
  let lastPurchasePrice = 0;
  let lastPurchaseAt = null;

  for (const t of transactions) {
    const qty = Number(t.quantity) || 0;
    const total = Number(t.total_amount) || 0;
    if (t.type === STOCK_TYPES.PURCHASE) {
      purchasedQty += qty;
      purchaseValue += total;
      // Remember the price from the most recent purchase.
      if (!lastPurchaseAt || new Date(t.created_at) > new Date(lastPurchaseAt)) {
        lastPurchaseAt = t.created_at;
        lastPurchasePrice = Number(t.price_per_unit) || 0;
      }
    } else if (t.type === STOCK_TYPES.SALE) {
      soldQty += qty;
      saleValue += total;
    } else if (t.type === STOCK_TYPES.USAGE) {
      usedQty += qty;
    } else if (t.type === STOCK_TYPES.LOSS) {
      lostQty += qty;
    }
  }

  const stock = purchasedQty - soldQty - usedQty - lostQty;
  const stockValue = stock * lastPurchasePrice; // approx value at last cost
  lossValue = lostQty * lastPurchasePrice; // approx cost of what was lost
  return {
    purchasedQty,
    soldQty,
    usedQty,
    lostQty,
    stock,
    purchaseValue,
    saleValue,
    lossValue,
    lastPurchasePrice,
    stockValue,
  };
}

// Is this product at or below its minimum stock level? (0 = no alert set)
export function isLowStock(stock, minimumStock) {
  const min = Number(minimumStock) || 0;
  return min > 0 && stock <= min;
}

// Group a product's PURCHASES by vendor to compare prices (cheapest first).
// Returns [{ vendor, minPrice, lastPrice, lastAt, totalQty, orders }].
export function pricesByVendor(transactions = []) {
  const map = {};
  for (const t of transactions) {
    if (t.type !== STOCK_TYPES.PURCHASE) continue;
    const vendor = t.vendor_name || "Unknown";
    const price = Number(t.price_per_unit) || 0;
    const g = (map[vendor] ||= {
      vendor,
      vendorId: t.vendor_id || null,
      minPrice: price,
      lastPrice: price,
      lastAt: t.created_at,
      totalQty: 0,
      orders: 0,
    });
    if (!g.vendorId && t.vendor_id) g.vendorId = t.vendor_id;
    g.minPrice = Math.min(g.minPrice, price);
    g.orders += 1;
    g.totalQty += Number(t.quantity) || 0;
    if (new Date(t.created_at) >= new Date(g.lastAt)) {
      g.lastAt = t.created_at;
      g.lastPrice = price;
    }
  }
  // Cheapest first, judged by each vendor's LATEST purchase price.
  return Object.values(map).sort((a, b) => a.lastPrice - b.lastPrice);
}

// Readable line for the history table, e.g. "12 × ₹40 · Ramesh Traders".
export function describeStockTx(tx) {
  const qty = Number(tx.quantity) || 0;
  const price = Number(tx.price_per_unit) || 0;
  const base = `${qty} × ${formatCurrency(price)}`;
  if (tx.type === STOCK_TYPES.PURCHASE && tx.vendor_name)
    return `${base} · ${tx.vendor_name}`;
  return tx.note ? `${base} · ${tx.note}` : base;
}
