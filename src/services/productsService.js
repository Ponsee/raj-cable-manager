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
  { productName, incomeCategory, incomeNote, paymentMethod } = {}
) {
  const { data, error } = await supabase
    .from("stock_transactions")
    .insert([tx])
    .select()
    .single();
  if (error) throw error;

  const label = productName || "Product";
  if (tx.type === STOCK_TYPES.PURCHASE) {
    const note = `${label} — ${tx.quantity} purchased${
      tx.vendor_name ? ` from ${tx.vendor_name}` : ""
    }`;
    const { error: e } = await supabase.from("expenses").insert([
      {
        amount: tx.total_amount,
        category: PURCHASE_EXPENSE_CATEGORY,
        note,
        ...(tx.created_at ? { created_at: tx.created_at } : {}),
      },
    ]);
    if (e) throw e;
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
  purchaseDate = "",
}) {
  const createdAt = purchaseTimestamp(purchaseDate);
  const rows = lines.map((l) => ({
    product_id: l.product_id,
    type: STOCK_TYPES.PURCHASE,
    quantity: Number(l.quantity) || 0,
    price_per_unit: Number(l.price_per_unit) || 0,
    selling_price: Number(l.selling_price) || null,
    total_amount: (Number(l.quantity) || 0) * (Number(l.price_per_unit) || 0),
    vendor_id: vendorId || null,
    vendor_name: vendorName || null,
    ...(createdAt ? { created_at: createdAt } : {}),
  }));

  const { error } = await supabase.from("stock_transactions").insert(rows);
  if (error) throw error;

  const subtotal = rows.reduce((s, r) => s + r.total_amount, 0);
  const disc = Number(discount) || 0;
  const trans = Number(transport) || 0;
  const total = Math.max(0, subtotal - disc + trans);
  const extras = [
    disc ? `disc ₹${disc}` : null,
    trans ? `transport ₹${trans}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const { error: e2 } = await supabase.from("expenses").insert([
    {
      amount: total,
      category: "Product purchase",
      note: `Bulk purchase${vendorName ? ` from ${vendorName}` : ""}: ${
        lines.length
      } item(s)${extras ? ` (${extras})` : ""}`,
      ...(createdAt ? { created_at: createdAt } : {}),
    },
  ]);
  if (e2) throw e2;

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
