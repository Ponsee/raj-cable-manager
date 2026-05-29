// All Supabase calls for products & stock live here.
import { supabase } from "./supabase";
import { calcStock } from "../utils/productCalc";
import { STOCK_TYPES } from "../constants";

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

export async function createProduct(product) {
  const { data, error } = await supabase
    .from("products")
    .insert([product])
    .select()
    .single();
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
export async function addStockTransaction(tx, { productName } = {}) {
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
    const { error: e } = await supabase
      .from("expenses")
      .insert([{ amount: tx.total_amount, category: PURCHASE_EXPENSE_CATEGORY, note }]);
    if (e) throw e;
  } else if (tx.type === STOCK_TYPES.SALE) {
    const note = `${label} — ${tx.quantity} sold`;
    const { error: e } = await supabase
      .from("income")
      .insert([{ amount: tx.total_amount, category: SALE_INCOME_CATEGORY, note }]);
    if (e) throw e;
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
export async function addBulkPurchase({
  vendorId,
  vendorName,
  lines,
  discount = 0,
  transport = 0,
}) {
  const rows = lines.map((l) => ({
    product_id: l.product_id,
    type: STOCK_TYPES.PURCHASE,
    quantity: Number(l.quantity) || 0,
    price_per_unit: Number(l.price_per_unit) || 0,
    selling_price: Number(l.selling_price) || null,
    total_amount: (Number(l.quantity) || 0) * (Number(l.price_per_unit) || 0),
    vendor_id: vendorId || null,
    vendor_name: vendorName || null,
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
