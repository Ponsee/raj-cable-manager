// All Supabase calls for customers (the person). Their internet lines live in
// connectionsService; each line holds its own modem (modemsService).
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { deriveCustomerStatus, modemBadge } from "../utils/ftu";
import { MODEM_OWNERSHIP } from "../constants";

// customer -> lines (with provider) -> modems on each line
const WITH_LINES =
  "*, connections(*, provider:providers(id, name, fields), modems(*))";

const clean = (v) => {
  const t = typeof v === "string" ? v.trim() : v;
  return t === "" || t === undefined ? null : t;
};

// Add the derived bits the UI needs: customer status + a modem badge per line.
function decorate(c) {
  // Oldest line first, so the order doesn't jump around after an edit.
  const connections = [...(c.connections || [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((conn) => ({ ...conn, badge: modemBadge(conn.modems) }));
  return { ...c, connections, status: deriveCustomerStatus(connections) };
}

export async function getCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select(WITH_LINES)
    .order("name", { ascending: true });
  throwDb(error);
  return (data || []).map(decorate);
}

export async function getCustomer(id) {
  const { data, error } = await supabase
    .from("customers")
    .select(WITH_LINES)
    .eq("id", id)
    .single();
  throwDb(error);
  return decorate(data);
}

function fields(c) {
  return {
    name: clean(c.name),
    phone: clean(c.phone),
    alt_phone: clean(c.alt_phone),
    email: clean(c.email),
    address: clean(c.address),
    notes: clean(c.notes),
  };
}

export async function createCustomer(customer) {
  const row = fields(customer);
  if (!row.name) throw new Error("Enter the customer's name.");
  const { data, error } = await supabase.from("customers").insert([row]).select().single();
  throwDb(error);
  return data;
}

export async function updateCustomer(id, updates) {
  const row = fields(updates);
  if (!row.name) throw new Error("Enter the customer's name.");
  const { data, error } = await supabase
    .from("customers")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  throwDb(error);
  return data;
}

// Delete a customer and their lines. Blocked while an FTU modem is still on one
// of the lines (collect it first). A customer's own-modem records are removed
// with them; past income keeps its amount (connection_id is set to null by the DB).
export async function deleteCustomer(id) {
  const { data: lines, error: e1 } = await supabase
    .from("connections")
    .select("id")
    .eq("customer_id", id);
  throwDb(e1);
  const lineIds = (lines || []).map((l) => l.id);

  if (lineIds.length) {
    const { data: modems, error: e2 } = await supabase
      .from("modems")
      .select("id, ownership")
      .in("connection_id", lineIds);
    throwDb(e2);
    if ((modems || []).some((m) => m.ownership === MODEM_OWNERSHIP.FTU))
      throw new Error("This customer still has an FTU modem. Mark it returned first.");
    if (modems?.length) {
      const { error: e3 } = await supabase
        .from("modems")
        .delete()
        .in("id", modems.map((m) => m.id));
      throwDb(e3);
    }
  }

  const { error } = await supabase.from("customers").delete().eq("id", id);
  throwDb(error);
}
