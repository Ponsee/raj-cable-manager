// All Supabase calls for products & stock live here.
import { supabase } from "./supabase";
import { calcStock } from "../utils/productCalc";
import { STOCK_TYPES, PRODUCT_CODE_PREFIXES } from "../constants";

// Categories used on the auto-created income/expense rows.
const PURCHASE_EXPENSE_CATEGORY = "Product purchase";
const SALE_INCOME_CATEGORY = "Product sales";

// ---- Products ----

export async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Products list + each product's current stock (computed from transactions).
export async function getProductsWithStock() {
  const products = await getProducts();

  const { data: txs, error } = await supabase
    .from("stock_transactions")
    .select("product_id, type, quantity, price_per_unit, total_amount, created_at");
  if (error) throw error;

  const byProduct = {};
  for (const t of txs) {
    (byProduct[t.product_id] ||= []).push(t);
  }

  return products.map((p) => ({
    ...p,
    ...calcStock(byProduct[p.id] || []),
  }));
}

// All sales (with the product name), for "best selling" reports. Each row:
// { product_id, name, quantity, amount, created_at }.
export async function getSales() {
  const { data, error } = await supabase
    .from("stock_transactions")
    .select("product_id, quantity, total_amount, created_at, products(name)")
    .eq("type", STOCK_TYPES.SALE);
  if (error) throw error;
  return (data || []).map((r) => ({
    product_id: r.product_id,
    name: r.products?.name || "Product",
    quantity: Number(r.quantity) || 0,
    amount: Number(r.total_amount) || 0,
    created_at: r.created_at,
  }));
}

export async function getProduct(id) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// Category → code prefix (e.g. Cable → CAB). Unknown categories use their
// first 3 letters (padded), falling back to PRD.
function codePrefix(category) {
  if (category && PRODUCT_CODE_PREFIXES[category]) return PRODUCT_CODE_PREFIXES[category];
  const letters = (category || "PRD").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "PRD").padEnd(3, "X");
}

// Next code for a category, e.g. "CAB001". Looks at existing codes with the
// same prefix and adds 1. Best-effort — never throws (returns ...001 if it can't read).
export async function generateProductCode(category) {
  const prefix = codePrefix(category);
  let max = 0;
  const { data, error } = await supabase
    .from("products")
    .select("code")
    .ilike("code", `${prefix}%`);
  if (!error) {
    for (const r of data || []) {
      const m = /^([A-Za-z]+)(\d+)$/.exec(r.code || "");
      if (m && m[1].toUpperCase() === prefix) max = Math.max(max, Number(m[2]));
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function createProduct(product) {
  const row = { ...product };
  if (!row.code) {
    try {
      row.code = await generateProductCode(row.category);
    } catch {
      /* code column may not exist yet */
    }
  }
  let { data, error } = await supabase.from("products").insert([row]).select().single();
  // If the new columns (code / image_urls) aren't there yet, retry without them.
  if (error) {
    /* eslint-disable no-unused-vars */
    const { code, image_urls, ...basic } = row;
    /* eslint-enable no-unused-vars */
    ({ data, error } = await supabase.from("products").insert([basic]).select().single());
  }
  if (error) throw error;
  return data;
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Delete a product. Its stock_transactions are removed too (ON DELETE CASCADE);
// any auto-created income/expense rows stay as financial history.
export async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ---- Stock transactions ----

export async function getStockTransactions(productId) {
  const { data, error } = await supabase
    .from("stock_transactions")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Add a purchase or sale. We only ever INSERT (Business Rule 1).
// A purchase also creates an Expense; a sale also creates an Income, so the
// books stay in sync (per the master plan). `productName` is used in the note.
// opts.incomeCategory / opts.incomeNote let callers (e.g. the New Cable /
// New Internet income flow) tag the auto-created income row instead of the
// generic "Product sales". created_at is shared with the stock row so they
// land on the same day.
export async function addStockTransaction(
  tx,
  { productName, incomeCategory, incomeNote, paymentMethod, cashAmount, onlineAmount } = {}
) {
  const { data, error } = await supabase
    .from("stock_transactions")
    .insert([tx])
    .select()
    .single();
  if (error) throw error;

  const label = productName || "Product";
  if (tx.type === STOCK_TYPES.PURCHASE) {
    const isSplit = paymentMethod === "Split";
    const splitNote = isSplit
      ? ` (Cash ₹${Number(cashAmount) || 0} + Online ₹${Number(onlineAmount) || 0})`
      : "";
    const note = `${label} — ${tx.quantity} purchased${
      tx.vendor_name ? ` from ${tx.vendor_name}` : ""
    }${splitNote}`;
    const expenseRow = {
      amount: tx.total_amount,
      category: PURCHASE_EXPENSE_CATEGORY,
      note,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(isSplit
        ? {
            cash_amount: Number(cashAmount) || 0,
            online_amount: Number(onlineAmount) || 0,
          }
        : {}),
      ...(tx.created_at ? { created_at: tx.created_at } : {}),
    };
    let { data: exp, error: e } = await supabase
      .from("expenses")
      .insert([expenseRow])
      .select("id")
      .single();
    // If the payment columns aren't there yet (migration not run), insert without them.
    if (e && /payment_method|cash_amount|online_amount/.test(e.message || "")) {
      /* eslint-disable no-unused-vars */
      const { payment_method, cash_amount, online_amount, ...rest } = expenseRow;
      /* eslint-enable no-unused-vars */
      ({ data: exp, error: e } = await supabase
        .from("expenses")
        .insert([rest])
        .select("id")
        .single());
    }
    if (e) throw e;
    // Link this stock row to its expense so a purchase delete removes both.
    // Ignored if the expense_id column isn't there yet (migration not run).
    if (exp?.id) {
      await supabase
        .from("stock_transactions")
        .update({ expense_id: exp.id })
        .eq("id", data.id);
    }
  } else if (tx.type === STOCK_TYPES.SALE) {
    const note = incomeNote || `${label} — ${tx.quantity} sold`;
    const row = {
      amount: tx.total_amount,
      category: incomeCategory || SALE_INCOME_CATEGORY,
      note,
      stock_tx_id: data.id, // link the money to this stock movement
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(tx.created_at ? { created_at: tx.created_at } : {}),
    };
    let { error: e } = await supabase.from("income").insert([row]);
    // If the link column doesn't exist yet (migration not run), save without it.
    if (e) {
      const { stock_tx_id, ...noLink } = row;
      ({ error: e } = await supabase.from("income").insert([noLink]));
    }
    if (e) throw e;
  }

  return data;
}

// Update an existing product sale: changes the stock movement (quantity / price)
// and its linked income row together, so stock and money stay in sync.
export async function updateProductSale({
  incomeId,
  stockTxId,
  productId,
  quantity,
  price,
  note,
  paymentMethod,
}) {
  const q = Number(quantity) || 0;
  const p = Number(price) || 0;
  const total = q * p;

  const { error: e1 } = await supabase
    .from("stock_transactions")
    .update({
      quantity: q,
      price_per_unit: p,
      total_amount: total,
      ...(productId ? { product_id: productId } : {}),
    })
    .eq("id", stockTxId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("income")
    .update({
      amount: total,
      note: note?.trim() || null,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    })
    .eq("id", incomeId);
  if (e2) throw e2;
}

// Write off stock that was damaged / missing / defective / returned.
// Reduces stock (a 'loss' transaction) and creates NO income or expense — the
// money was already spent when it was purchased. The reason is kept in `note`
// so losses can be monitored separately from sales and service usage.
export async function recordStockLoss({
  productId,
  productName,
  quantity,
  reason,
  note,
  date = "",
}) {
  const createdAt = purchaseTimestamp(date);
  const fullNote = [reason, note?.trim()].filter(Boolean).join(" — ");
  return addStockTransaction(
    {
      product_id: productId,
      type: STOCK_TYPES.LOSS,
      quantity: Number(quantity) || 0,
      price_per_unit: 0,
      total_amount: 0,
      note: fullNote || reason || "Stock loss",
      ...(createdAt ? { created_at: createdAt } : {}),
    },
    { productName }
  );
}

// Customer return: an item comes back onto the shelf (stock IN) and, if you
// refunded the customer, money goes OUT as a "Customer refund" expense (carrying
// the Cash/Online method). The refund expense is linked to the return stock row
// so they can be removed together. No refund → just stock back, no money entry.
export async function recordReturn({
  productId,
  productName,
  quantity,
  refund = false,
  refundAmount = 0,
  paymentMethod,
  note,
  date = "",
}) {
  const createdAt = purchaseTimestamp(date);
  const qty = Number(quantity) || 0;
  const amount = refund ? Number(refundAmount) || 0 : 0;

  const { data, error } = await supabase
    .from("stock_transactions")
    .insert([
      {
        product_id: productId,
        type: STOCK_TYPES.RETURN,
        quantity: qty,
        price_per_unit: 0,
        total_amount: amount, // the refund value (0 when no money was returned)
        note: note?.trim() || "Customer return",
        ...(createdAt ? { created_at: createdAt } : {}),
      },
    ])
    .select("id")
    .single();
  if (error) throw error;

  if (amount > 0) {
    const expenseRow = {
      amount,
      category: "Customer refund",
      note: `Refund${productName ? ` — ${productName}` : ""}${
        note?.trim() ? ` (${note.trim()})` : ""
      }`,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    };
    let { data: exp, error: e } = await supabase
      .from("expenses")
      .insert([expenseRow])
      .select("id")
      .single();
    if (e && /payment_method/.test(e.message || "")) {
      /* eslint-disable no-unused-vars */
      const { payment_method, ...rest } = expenseRow;
      /* eslint-enable no-unused-vars */
      ({ data: exp, error: e } = await supabase
        .from("expenses")
        .insert([rest])
        .select("id")
        .single());
    }
    if (e) throw e;
    // Link the refund expense to the return movement (for combined delete).
    if (exp?.id && data?.id) {
      await supabase
        .from("stock_transactions")
        .update({ expense_id: exp.id })
        .eq("id", data.id);
    }
  }

  return data;
}

// Subcategory / brand values used before, to suggest again (e.g. TCCL, Airtel).
export async function getSubcategorySuggestions() {
  const { data, error } = await supabase
    .from("products")
    .select("subcategory");
  if (error) throw error;
  const set = new Set();
  for (const row of data) if (row.subcategory) set.add(row.subcategory);
  return [...set];
}

// Distinct categories already used on products (merged with defaults in the UI).
export async function getCategorySuggestions() {
  const { data, error } = await supabase.from("products").select("category");
  if (error) throw error;
  const set = new Set();
  for (const row of data) if (row.category) set.add(row.category);
  return [...set];
}

// Upload a product photo to the "product-images" Storage bucket; return its URL.
export async function uploadProductImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

// Bulk purchase: buy several products from one vendor in a single order.
// Inserts a purchase row per line, ONE combined expense (subtotal − discount +
// transport), and refreshes each product's latest selling price.
// lines: [{ product_id, quantity, price_per_unit, selling_price }]
// Turn a date input value ("YYYY-MM-DD") into a timestamp. We keep the current
// time-of-day so two separate orders on the same date stay in distinct batches.
// Empty value → undefined, letting the DB default created_at to now().
function purchaseTimestamp(dateStr) {
  if (!dateStr) return undefined;
  const now = new Date();
  const d = new Date(dateStr);
  d.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  return d.toISOString();
}

export async function addBulkPurchase({
  vendorId,
  vendorName,
  lines,
  discount = 0,
  transport = 0,
  paymentMethod,
  cashAmount,
  onlineAmount,
  purchaseDate = "",
}) {
  const createdAt = purchaseTimestamp(purchaseDate);
  const disc = Number(discount) || 0;
  const trans = Number(transport) || 0;
  const rows = lines.map((l, i) => ({
    product_id: l.product_id,
    type: STOCK_TYPES.PURCHASE,
    quantity: Number(l.quantity) || 0,
    price_per_unit: Number(l.price_per_unit) || 0,
    selling_price: Number(l.selling_price) || null,
    total_amount: (Number(l.quantity) || 0) * (Number(l.price_per_unit) || 0),
    vendor_id: vendorId || null,
    vendor_name: vendorName || null,
    // Store the order's discount/transport on the FIRST row only, so summing
    // across the batch yields the right totals.
    discount: i === 0 ? disc : 0,
    transport: i === 0 ? trans : 0,
    ...(createdAt ? { created_at: createdAt } : {}),
  }));

  let { data: inserted, error } = await supabase
    .from("stock_transactions")
    .insert(rows)
    .select("id");
  // If discount/transport columns aren't there yet, insert without them.
  if (error) {
    /* eslint-disable no-unused-vars */
    const stripped = rows.map(({ discount, transport, ...r }) => r);
    /* eslint-enable no-unused-vars */
    ({ data: inserted, error } = await supabase
      .from("stock_transactions")
      .insert(stripped)
      .select("id"));
  }
  if (error) throw error;

  const subtotal = rows.reduce((s, r) => s + r.total_amount, 0);
  const total = Math.max(0, subtotal - disc + trans);
  const extras = [
    disc ? `disc ₹${disc}` : null,
    trans ? `transport ₹${trans}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const isSplit = paymentMethod === "Split";
  const splitNote = isSplit
    ? ` (Cash ₹${Number(cashAmount) || 0} + Online ₹${Number(onlineAmount) || 0})`
    : "";
  const expenseRow = {
    amount: total,
    category: "Product purchase",
    note: `Bulk purchase${vendorName ? ` from ${vendorName}` : ""}: ${
      lines.length
    } item(s)${extras ? ` (${extras})` : ""}${splitNote}`,
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(isSplit
      ? {
          cash_amount: Number(cashAmount) || 0,
          online_amount: Number(onlineAmount) || 0,
        }
      : {}),
    ...(createdAt ? { created_at: createdAt } : {}),
  };
  let { data: exp, error: e2 } = await supabase
    .from("expenses")
    .insert([expenseRow])
    .select("id")
    .single();
  // If the payment columns aren't there yet (migration not run), insert without them.
  if (e2 && /payment_method|cash_amount|online_amount/.test(e2.message || "")) {
    /* eslint-disable no-unused-vars */
    const { payment_method, cash_amount, online_amount, ...rest } = expenseRow;
    /* eslint-enable no-unused-vars */
    ({ data: exp, error: e2 } = await supabase
      .from("expenses")
      .insert([rest])
      .select("id")
      .single());
  }
  if (e2) throw e2;

  // Link every stock row in this batch to the expense (for batch delete).
  // Ignored if the expense_id column isn't there yet (migration not run).
  if (exp?.id && inserted?.length) {
    await supabase
      .from("stock_transactions")
      .update({ expense_id: exp.id })
      .in(
        "id",
        inserted.map((r) => r.id)
      );
  }

  // Update each product's latest selling price.
  for (const l of lines) {
    if (Number(l.selling_price) > 0) {
      await supabase
        .from("products")
        .update({ selling_price: Number(l.selling_price) })
        .eq("id", l.product_id);
    }
  }
}

// Opening stock: record the quantities you already had on the shelf. Adds stock
// (type "opening") but creates NO expense and NO income — it's not money moving
// now. Buying price and vendor are optional. Each line:
//   { product_id, quantity, price_per_unit?, selling_price?, vendor_id?, vendor_name? }
export async function addOpeningStockBatch({ lines, asOfDate = "" }) {
  const createdAt = purchaseTimestamp(asOfDate);
  const rows = lines.map((l) => ({
    product_id: l.product_id,
    type: STOCK_TYPES.OPENING,
    quantity: Number(l.quantity) || 0,
    price_per_unit: Number(l.price_per_unit) || 0,
    selling_price: Number(l.selling_price) || null,
    total_amount: (Number(l.quantity) || 0) * (Number(l.price_per_unit) || 0),
    vendor_id: l.vendor_id || null,
    vendor_name: l.vendor_name || null,
    note: "Opening stock",
    ...(createdAt ? { created_at: createdAt } : {}),
  }));

  const { error } = await supabase.from("stock_transactions").insert(rows);
  if (error) throw error;

  // Save/refresh each product's selling price when one was entered.
  for (const l of lines) {
    if (Number(l.selling_price) > 0) {
      await supabase
        .from("products")
        .update({ selling_price: Number(l.selling_price) })
        .eq("id", l.product_id);
    }
  }
}

// Delete a whole purchase batch: removes its stock movements AND the linked
// expense together, so product stock, vendor history, and expenses all stay in
// sync. `items` are the batch's stock_transactions rows (carry id + expense_id).
export async function deletePurchaseBatch(items) {
  const stockIds = items.map((i) => i.id).filter(Boolean);
  const expenseIds = [
    ...new Set(items.map((i) => i.expense_id).filter(Boolean)),
  ];

  if (stockIds.length) {
    const { error } = await supabase
      .from("stock_transactions")
      .delete()
      .in("id", stockIds);
    if (error) throw error;
  }
  if (expenseIds.length) {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .in("id", expenseIds);
    if (error) throw error;
  }
}

// "What to buy this month" analysis. For each product it computes recent
// consumption, a usage-based reorder qty and a low-stock top-up, the larger of
// which is the suggested qty, and an estimated cost (at last purchase price).
// Also returns this-month spend, last-month spend, and the remaining budget.
//   usageDays  - window used to measure how fast a product moves (default 60)
//   bufferDays - how many days of stock to keep on hand (default 30)
export async function getPurchasePlan({ usageDays = 60, bufferDays = 30 } = {}) {
  const products = await getProducts();
  const { data: txs, error } = await supabase
    .from("stock_transactions")
    .select("product_id, type, quantity, total_amount, price_per_unit, created_at");
  if (error) throw error;

  const byProduct = {};
  for (const t of txs) (byProduct[t.product_id] ||= []).push(t);

  const now = Date.now();
  const usageCutoff = now - usageDays * 86400000;
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();

  let suggestedTotal = 0;
  let boughtThisMonth = 0;
  let lastMonthSpend = 0;

  const rows = products.map((p) => {
    const list = byProduct[p.id] || [];
    const s = calcStock(list);
    let usageQty = 0;
    let boughtQtyThisMonth = 0;
    for (const t of list) {
      const ts = new Date(t.created_at).getTime();
      const q = Number(t.quantity) || 0;
      const out =
        t.type === STOCK_TYPES.SALE ||
        t.type === STOCK_TYPES.USAGE ||
        t.type === STOCK_TYPES.LOSS;
      if (out && ts >= usageCutoff) usageQty += q;
      if (t.type === STOCK_TYPES.PURCHASE) {
        const amt = Number(t.total_amount) || 0;
        if (ts >= monthStart) {
          boughtQtyThisMonth += q;
          boughtThisMonth += amt;
        } else if (ts >= lastMonthStart) {
          lastMonthSpend += amt;
        }
      }
    }
    const perDay = usageQty / usageDays;
    const monthlyUse = Math.round(perDay * 30 * 10) / 10;
    const usageSuggested = Math.max(0, Math.ceil(perDay * bufferDays - s.stock));
    const min = Number(p.minimum_stock) || 0;
    const low = min > 0 && s.stock <= min;
    const lowTopUp = low ? Math.max(0, min * 2 - s.stock) : 0;
    const suggestedQty = Math.max(usageSuggested, lowTopUp);
    const unitCost = Number(s.lastPurchasePrice) || 0;
    const estCost = suggestedQty * unitCost;
    suggestedTotal += estCost;
    return {
      id: p.id,
      name: p.name,
      code: p.code || "",
      unit: p.unit || "",
      stock: s.stock,
      min,
      low,
      monthlyUse,
      usageSuggested,
      lowTopUp,
      suggestedQty,
      unitCost,
      estCost,
      boughtQtyThisMonth,
    };
  });

  rows.sort(
    (a, b) => b.suggestedQty - a.suggestedQty || b.estCost - a.estCost
  );

  return {
    rows,
    totals: {
      suggestedTotal,
      boughtThisMonth,
      lastMonthSpend,
      remaining: Math.max(0, suggestedTotal - boughtThisMonth),
    },
  };
}

// Vendor names typed before, to suggest again on new purchases.
export async function getVendorSuggestions() {
  const { data, error } = await supabase
    .from("stock_transactions")
    .select("vendor_name")
    .eq("type", STOCK_TYPES.PURCHASE);
  if (error) throw error;

  const set = new Set();
  for (const row of data) {
    if (row.vendor_name) set.add(row.vendor_name);
  }
  return [...set];
}
