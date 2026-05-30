// All Supabase calls for vendors (suppliers we buy stock from).
import { supabase } from "./supabase";

export async function getVendors() {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

// Vendors + a quick summary (orders count + total spent) from their purchases.
export async function getVendorsWithStats() {
  const vendors = await getVendors();

  const { data: txs, error } = await supabase
    .from("stock_transactions")
    .select("vendor_id, total_amount")
    .eq("type", "purchase");
  if (error) throw error;

  const stats = {};
  for (const t of txs) {
    if (!t.vendor_id) continue;
    const s = (stats[t.vendor_id] ||= { orders: 0, totalSpent: 0 });
    s.orders += 1;
    s.totalSpent += Number(t.total_amount) || 0;
  }

  return vendors.map((v) => ({
    ...v,
    orders: stats[v.id]?.orders || 0,
    totalSpent: stats[v.id]?.totalSpent || 0,
  }));
}

export async function getVendor(id) {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createVendor(vendor) {
  const { data, error } = await supabase
    .from("vendors")
    .insert([vendor])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVendor(id, updates) {
  const { data, error } = await supabase
    .from("vendors")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Delete a vendor. Past purchases are kept (the vendor_name snapshot stays),
// but unlinked first so the foreign key doesn't block the delete.
export async function deleteVendor(id) {
  const { error: e1 } = await supabase
    .from("stock_transactions")
    .update({ vendor_id: null })
    .eq("vendor_id", id);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("vendors").delete().eq("id", id);
  if (e2) throw e2;
}

// Everything bought from this vendor (with product name + unit), newest first.
export async function getVendorPurchases(vendorId) {
  const { data, error } = await supabase
    .from("stock_transactions")
    .select("*, product:products(name, unit)")
    .eq("vendor_id", vendorId)
    .eq("type", "purchase")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
