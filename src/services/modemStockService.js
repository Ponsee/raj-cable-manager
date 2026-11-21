// Keeps modem UNITS in step with product STOCK for products that have
// "Track each unit" switched on (products.track_units). Stock itself is still
// calculated from stock_transactions; these helpers make every stock movement
// also change the matching units, so the two always agree:
//   purchase / opening stock -> new in-stock units
//   sale / usage             -> units leave stock ("out", or onto a customer's line)
//   loss                     -> units become lost
//   customer return          -> units come back into stock
//   deleting a sale / purchase -> the units are put back / removed
// Products that aren't tracked (or databases where the migration hasn't been run)
// are left completely alone.
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { STOCK_TYPES, MODEM_OWNERSHIP, MODEM_STATUS } from "../constants";
import { normalizeMac, todayISO } from "../utils/ftu";

const blank = (v) => {
  const t = typeof v === "string" ? v.trim() : v;
  return t === "" || t === undefined ? null : t;
};

function cleanMac(v) {
  const m = normalizeMac(v);
  if (m === null) throw new Error(`"${v}" is not a valid MAC address.`);
  return m || null;
}

// Which of these products track units? (An empty set if the column isn't there yet.)
export async function getTrackedIds(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("track_units", true)
    .in("id", ids);
  if (error) return new Set();
  return new Set((data || []).map((r) => r.id));
}

// ---- Stock in: purchase / opening stock ----
// rows: [{ id, product_id, quantity }] (the saved stock rows).
// details: { [stockTxId]: [{ serial_no, mac_address }, ...] } — optional, per unit.
export async function createUnitsForPurchases(rows, details = {}) {
  const tracked = await getTrackedIds(rows.map((r) => r.product_id));
  const units = [];
  for (const r of rows) {
    if (!tracked.has(r.product_id)) continue;
    const n = Math.max(0, Math.round(Number(r.quantity) || 0));
    const det = details[r.id] || [];
    for (let i = 0; i < n; i++) {
      const d = det[i] || {};
      units.push({
        product_id: r.product_id,
        ownership: MODEM_OWNERSHIP.FTU,
        status: MODEM_STATUS.IN_STOCK,
        purchase_tx_id: r.id,
        serial_no: blank(d.serial_no),
        mac_address: cleanMac(d.mac_address),
      });
    }
  }
  for (let i = 0; i < units.length; i += 200) {
    const { error } = await supabase.from("modems").insert(units.slice(i, i + 200));
    throwDb(error);
  }
  return units.length;
}

// ---- Stock out: sale / usage / loss ----
// Units to take: the ones chosen (must be in stock), else the oldest in stock.
async function pickInStockUnits(productId, qty, unitIds) {
  if (unitIds?.length) {
    const { data, error } = await supabase
      .from("modems")
      .select("id, product_id, status")
      .in("id", unitIds);
    throwDb(error);
    const ok = (data || []).filter(
      (u) => u.product_id === productId && u.status === MODEM_STATUS.IN_STOCK
    );
    if (ok.length !== unitIds.length)
      throw new Error("The chosen modem unit is no longer in stock.");
    return ok.map((u) => u.id);
  }
  const { data, error } = await supabase
    .from("modems")
    .select("id")
    .eq("product_id", productId)
    .eq("status", MODEM_STATUS.IN_STOCK)
    .order("created_at", { ascending: true })
    .limit(qty);
  throwDb(error);
  return (data || []).map((u) => u.id);
}

// tx: { id, product_id, type, quantity }. opts: { unitIds, connectionId, ownership }.
// With a connectionId the unit goes onto that customer's line; otherwise a sale /
// usage marks it "out" and a loss marks it "lost".
export async function takeUnitsOut(tx, opts = {}) {
  const tracked = await getTrackedIds([tx.product_id]);
  if (!tracked.has(tx.product_id)) return 0;
  const qty = Math.max(0, Math.round(Number(tx.quantity) || 0));
  const ids = await pickInStockUnits(tx.product_id, qty, opts.unitIds);
  if (!ids.length) return 0;

  let patch;
  if (tx.type === STOCK_TYPES.LOSS)
    patch = { status: MODEM_STATUS.LOST, connection_id: null };
  else if (opts.connectionId)
    patch = {
      status: MODEM_STATUS.WITH_CUSTOMER,
      connection_id: opts.connectionId,
      ownership: opts.ownership || MODEM_OWNERSHIP.FTU,
      issued_on: todayISO(),
      notice_sent_on: null,
    };
  else patch = { status: MODEM_STATUS.OUT, connection_id: null };

  const { error } = await supabase
    .from("modems")
    .update({ ...patch, out_tx_id: tx.id })
    .in("id", ids);
  throwDb(error);
  return ids.length;
}

// ---- Customer return: units come back into stock ----
export async function returnUnits(tx) {
  const tracked = await getTrackedIds([tx.product_id]);
  if (!tracked.has(tx.product_id)) return 0;
  const qty = Math.max(0, Math.round(Number(tx.quantity) || 0));
  const { data, error } = await supabase
    .from("modems")
    .select("id")
    .eq("product_id", tx.product_id)
    .eq("status", MODEM_STATUS.OUT)
    .order("created_at", { ascending: false })
    .limit(qty);
  throwDb(error);
  const ids = (data || []).map((u) => u.id);
  if (!ids.length) return 0;
  const { error: e2 } = await supabase
    .from("modems")
    .update({ status: MODEM_STATUS.IN_STOCK, connection_id: null, out_tx_id: null })
    .in("id", ids);
  throwDb(e2);
  return ids.length;
}

// One entry point used by addStockTransaction for every stock movement.
export async function syncUnitsForTx(tx, { units } = {}) {
  switch (tx.type) {
    case STOCK_TYPES.PURCHASE:
    case STOCK_TYPES.OPENING:
      return createUnitsForPurchases([tx], { [tx.id]: units?.details || [] });
    case STOCK_TYPES.SALE:
    case STOCK_TYPES.USAGE:
    case STOCK_TYPES.LOSS:
      return takeUnitsOut(tx, units || {});
    case STOCK_TYPES.RETURN:
      return returnUnits(tx);
    default:
      return 0;
  }
}

// ---- Deleting stock movements ----
// Deleting a sale / usage / loss puts its units back in stock.
export async function revertOutByTx(txId) {
  if (!txId) return;
  const { error } = await supabase
    .from("modems")
    .update({
      status: MODEM_STATUS.IN_STOCK,
      connection_id: null,
      out_tx_id: null,
      issued_on: null,
      notice_sent_on: null,
    })
    .eq("out_tx_id", txId);
  // Column missing (migration not run) -> nothing to put back.
  if (error && !/out_tx_id|column|schema cache/i.test(error.message || "")) throwDb(error);
}

// Deleting a purchase removes the units it created, but only if they're all still
// in stock. If any were already issued or sold, the delete is refused.
export async function removeUnitsForPurchases(txIds) {
  const ids = (txIds || []).filter(Boolean);
  if (!ids.length) return;
  const { data, error } = await supabase
    .from("modems")
    .select("id, status")
    .in("purchase_tx_id", ids);
  if (error) return; // column / table missing: nothing tracked
  if (!data?.length) return;
  if (data.some((u) => u.status !== MODEM_STATUS.IN_STOCK))
    throw new Error(
      "Some modems from this purchase have already been issued or sold. Return them to stock first."
    );
  const { error: e2 } = await supabase.from("modems").delete().in("id", data.map((u) => u.id));
  throwDb(e2);
}

// ---- Mismatch check ----
// { [productId]: in-stock unit count } for every product that has units.
export async function getUnitCounts() {
  const { data, error } = await supabase
    .from("modems")
    .select("product_id")
    .eq("status", MODEM_STATUS.IN_STOCK)
    .not("product_id", "is", null);
  if (error) return {};
  const counts = {};
  for (const r of data || []) counts[r.product_id] = (counts[r.product_id] || 0) + 1;
  return counts;
}

// One-time catch-up when "Track each unit" is switched on for a product that
// already has stock: add blank in-stock units until the unit count equals the
// stock count (serial / MAC can be filled in later). Returns how many were added.
export async function syncPlaceholders(productId, stock) {
  const target = Math.max(0, Math.round(Number(stock) || 0));
  const { count, error } = await supabase
    .from("modems")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("status", MODEM_STATUS.IN_STOCK);
  throwDb(error);
  const missing = target - (count || 0);
  if (missing <= 0) return 0;
  const units = Array.from({ length: missing }, () => ({
    product_id: productId,
    ownership: MODEM_OWNERSHIP.FTU,
    status: MODEM_STATUS.IN_STOCK,
  }));
  for (let i = 0; i < units.length; i += 200) {
    const { error: e2 } = await supabase.from("modems").insert(units.slice(i, i + 200));
    throwDb(e2);
  }
  return missing;
}

// In-stock units of one product (for the "which unit?" pickers), oldest first.
export async function getInStockUnits(productId) {
  const { data, error } = await supabase
    .from("modems")
    .select("id, product_id, serial_no, mac_address, created_at, product:products(name)")
    .eq("product_id", productId)
    .eq("status", MODEM_STATUS.IN_STOCK)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}
