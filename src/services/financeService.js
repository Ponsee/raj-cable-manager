// Shared calls for the income and expenses tables (same shape, so one service
// handles both — pass table = "income" or "expenses").
import { supabase } from "./supabase";

// Turn a date input ("YYYY-MM-DD") into a timestamp, keeping the current
// time-of-day so same-day entries stay in order. Empty → undefined (DB now()).
function entryTimestamp(dateStr) {
  if (!dateStr) return undefined;
  const now = new Date();
  const d = new Date(dateStr);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d.toISOString();
}

export async function getEntries(table) {
  const base = "id, amount, category, note, created_at";

  if (table !== "income") {
    const { data, error } = await supabase
      .from(table)
      .select(base)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // For income, try richest first and fall back if a column/migration is missing,
  // so the page always loads even before the migrations are run. We select
  // stock_tx_id directly (no embedded join) so deleting can always find and
  // remove the linked stock movement to restore stock.
  const variants = [
    `${base}, payment_method, stock_tx_id`,
    `${base}, payment_method`,
    base,
  ];
  for (const cols of variants) {
    const { data, error } = await supabase
      .from(table)
      .select(cols)
      .order("created_at", { ascending: false });
    if (!error) return data || [];
  }
  // Last resort: surface the base-query error.
  const { data, error } = await supabase
    .from(table)
    .select(base)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addEntry(table, { amount, category, note, date, paymentMethod }) {
  const createdAt = entryTimestamp(date);
  const row = {
    amount: Number(amount) || 0,
    category: category || null,
    note: note?.trim() || null,
    ...(table === "income" && paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(createdAt ? { created_at: createdAt } : {}),
  };
  const { error } = await supabase.from(table).insert([row]);
  if (error) throw error;
}

export async function updateEntry(
  table,
  id,
  { amount, category, note, date, paymentMethod }
) {
  const createdAt = entryTimestamp(date);
  const row = {
    amount: Number(amount) || 0,
    category: category?.trim() || null,
    note: note?.trim() || null,
    ...(table === "income" && paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(createdAt ? { created_at: createdAt } : {}),
  };
  const { error } = await supabase.from(table).update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// Delete an income entry AND its linked stock movement (if any). Removing the
// stock movement restores stock, since stock is computed from the movements.
export async function deleteIncomeEntry(entry) {
  if (entry.stock_tx_id) {
    const { error } = await supabase
      .from("stock_transactions")
      .delete()
      .eq("id", entry.stock_tx_id);
    if (error) throw error;
  }
  const { error } = await supabase.from("income").delete().eq("id", entry.id);
  if (error) throw error;
}

// Delete a whole day's batch (each entry + its stock movement).
export async function deleteIncomeBatch(entries) {
  for (const e of entries) await deleteIncomeEntry(e);
}

// Distinct categories already used (to suggest alongside the defaults).
export async function getCategorySuggestions(table) {
  const { data, error } = await supabase.from(table).select("category");
  if (error) return [];
  return [...new Set((data || []).map((r) => r.category).filter(Boolean))];
}
