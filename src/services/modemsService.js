// Modems: one row per physical unit, linked to the connection (line) it serves.
// product / serial / MAC are optional so a customer's modem can be recorded as
// just "FTU" or "own" first and completed later.
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { normalizeMac, todayISO } from "../utils/ftu";
import { MODEM_OWNERSHIP, MODEM_STATUS } from "../constants";

const blank = (v) => {
  const t = typeof v === "string" ? v.trim() : v;
  return t === "" || t === undefined ? null : t;
};

// Validate + normalise the optional identity fields (only those that are present).
function identity(d = {}) {
  const out = {};
  if (d.product_id !== undefined) out.product_id = blank(d.product_id);
  if (d.serial_no !== undefined) out.serial_no = blank(d.serial_no);
  if (d.mac_address !== undefined) {
    const mac = normalizeMac(d.mac_address);
    if (mac === null) throw new Error("Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).");
    out.mac_address = mac || null;
  }
  return out;
}

export async function getModems() {
  const { data, error } = await supabase
    .from("modems")
    .select(
      "*, product:products(name, subcategory), connection:connections(id, status, last_recharge_on, provider:providers(name), customer:customers(id, name, phone))"
    )
    .order("created_at", { ascending: false });
  throwDb(error);
  return data || [];
}

export async function createModem(modem) {
  const row = {
    ownership: modem.ownership || MODEM_OWNERSHIP.FTU,
    status: modem.status || MODEM_STATUS.IN_STOCK,
    connection_id: blank(modem.connection_id),
    ...identity(modem),
  };
  const { data, error } = await supabase.from("modems").insert([row]).select().single();
  throwDb(error);
  return data;
}

export async function updateModem(id, updates) {
  const { data, error } = await supabase
    .from("modems")
    .update({ ...updates, ...identity(updates) })
    .eq("id", id)
    .select()
    .single();
  throwDb(error);
  return data;
}

async function modemOnLine(connectionId) {
  const { data, error } = await supabase
    .from("modems")
    .select("*")
    .eq("connection_id", connectionId)
    .eq("status", MODEM_STATUS.WITH_CUSTOMER)
    .maybeSingle();
  throwDb(error);
  return data;
}

// Set what a line has: "ftu" (ours) | "customer" (their own / bought) | "none".
// FTU / own create the modem row straight away (no product or serial needed) or
// update the one already there. "none" only removes a bare placeholder; a modem
// that came from stock has to be returned instead.
export async function setLineModem(connectionId, kind, details = {}) {
  const existing = await modemOnLine(connectionId);

  if (kind === "none") {
    if (!existing) return null;
    if (existing.product_id || existing.serial_no)
      throw new Error("This modem came from stock. Use Mark returned instead.");
    const { error } = await supabase.from("modems").delete().eq("id", existing.id);
    throwDb(error);
    return null;
  }

  if (kind !== "ftu" && kind !== "customer") throw new Error("Pick FTU, Own or None.");
  const ownership = kind === "ftu" ? MODEM_OWNERSHIP.FTU : MODEM_OWNERSHIP.CUSTOMER;

  if (existing) return updateModem(existing.id, { ownership, ...details });
  return createModem({
    ...details,
    ownership,
    status: MODEM_STATUS.WITH_CUSTOMER,
    connection_id: connectionId,
    issued_on: todayISO(),
  });
}

// Bulk "Set modem" for the ticked customers' lines. Keeps going past failures
// and reports them, so one bad row doesn't stop the rest.
export async function bulkSetLineModem(connectionIds, kind) {
  const failed = [];
  let done = 0;
  for (const id of connectionIds) {
    try {
      await setLineModem(id, kind);
      done += 1;
    } catch (e) {
      failed.push({ id, error: e.message });
    }
  }
  return { done, failed };
}

export async function markNoticeSent(id, date = todayISO()) {
  const { error } = await supabase
    .from("modems")
    .update({ notice_sent_on: String(date).slice(0, 10) })
    .eq("id", id);
  throwDb(error);
}

// Collected back: the unit returns to stock and leaves the line.
export async function markReturned(id) {
  const { error } = await supabase
    .from("modems")
    .update({
      status: MODEM_STATUS.IN_STOCK,
      connection_id: null,
      issued_on: null,
      notice_sent_on: null,
    })
    .eq("id", id);
  throwDb(error);
}

export async function markLost(id) {
  const { error } = await supabase
    .from("modems")
    .update({ status: MODEM_STATUS.LOST, connection_id: null })
    .eq("id", id);
  throwDb(error);
}
