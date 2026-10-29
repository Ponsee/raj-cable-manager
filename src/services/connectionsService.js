// Internet lines (one per provider per customer). Status and the last recharge
// date live here, per line; the modem is linked to the line (modemsService).
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { splitFieldValues, todayISO } from "../utils/ftu";
import { CONNECTION_STATUS, MODEM_OWNERSHIP } from "../constants";

const STATUSES = Object.values(CONNECTION_STATUS);

const dateOrNull = (v) => (v ? String(v).slice(0, 10) : null);
const numOrNull = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function assertStatus(status) {
  if (!STATUSES.includes(status)) throw new Error("Pick Active, Inactive or Disconnected.");
}

// `provider` is the provider row (needs .id and .fields); `values` is the form's
// { fieldKey: value } map — split into real columns + the details json.
function rowFrom({ provider, values, installedOn, planAmount, status, lastRechargeOn }) {
  const row = {};
  if (provider && values) {
    const s = splitFieldValues(provider.fields, values);
    row.username = s.username ?? null;
    row.password = s.password ?? null;
    row.plan_name = s.plan_name ?? null;
    row.details = s.details;
  }
  if (installedOn !== undefined) row.installed_on = dateOrNull(installedOn);
  if (planAmount !== undefined) row.plan_amount = numOrNull(planAmount);
  if (lastRechargeOn !== undefined) row.last_recharge_on = dateOrNull(lastRechargeOn);
  if (status !== undefined) {
    assertStatus(status);
    row.status = status;
  }
  return row;
}

export async function createConnection({ customerId, provider, ...rest }) {
  if (!customerId) throw new Error("Pick a customer.");
  if (!provider?.id) throw new Error("Pick a provider.");
  const row = { customer_id: customerId, provider_id: provider.id, ...rowFrom({ provider, ...rest }) };
  const { data, error } = await supabase.from("connections").insert([row]).select().single();
  throwDb(error);
  return data;
}

export async function updateConnection(id, { provider, ...rest }) {
  const { data, error } = await supabase
    .from("connections")
    .update(rowFrom({ provider, ...rest }))
    .eq("id", id)
    .select()
    .single();
  throwDb(error);
  return data;
}

export async function setConnectionStatus(id, status) {
  assertStatus(status);
  const { error } = await supabase.from("connections").update({ status }).eq("id", id);
  throwDb(error);
}

// Bulk status change for the ticked customers' lines.
export async function bulkSetConnectionStatus(ids, status) {
  assertStatus(status);
  if (!ids.length) return;
  const { error } = await supabase.from("connections").update({ status }).in("id", ids);
  throwDb(error);
}

// "Recharged" button: record the date by hand (no income entry).
export async function markRecharged(id, date = todayISO()) {
  const { error } = await supabase
    .from("connections")
    .update({ last_recharge_on: dateOrNull(date) })
    .eq("id", id);
  throwDb(error);
}

// Every line with its customer, provider and modem — feeds the Modems page and
// the collect list.
export async function getConnectionsWithModems() {
  const { data, error } = await supabase
    .from("connections")
    .select(
      "*, customer:customers(id, name, phone), provider:providers(id, name), modems(*, product:products(name, subcategory))"
    )
    .order("created_at", { ascending: false });
  throwDb(error);
  return data || [];
}

// Delete a line. Blocked while an FTU modem is on it; a customer's own-modem
// record is removed with the line. Past income keeps its amount.
export async function deleteConnection(id) {
  const { data: modems, error: e1 } = await supabase
    .from("modems")
    .select("id, ownership")
    .eq("connection_id", id);
  throwDb(e1);
  if ((modems || []).some((m) => m.ownership === MODEM_OWNERSHIP.FTU))
    throw new Error("An FTU modem is still on this connection. Mark it returned first.");
  if (modems?.length) {
    const { error: e2 } = await supabase
      .from("modems")
      .delete()
      .in("id", modems.map((m) => m.id));
    throwDb(e2);
  }
  const { error } = await supabase.from("connections").delete().eq("id", id);
  throwDb(error);
}
