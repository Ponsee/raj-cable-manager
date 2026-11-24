// History of collected (returned) modems. A returned modem leaves the customer's
// line, so this is where "who returned it, and when" is kept.
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";

// Best effort: the return itself has already succeeded, so a missing table
// (migration not run) must not turn it into an error.
export async function logReturn(modem, { date, note, mac } = {}) {
  const cust = modem.connection?.customer;
  const { error } = await supabase.from("modem_events").insert([
    {
      modem_id: modem.id,
      event: "returned",
      customer_id: cust?.id || null,
      customer_name: cust?.name || null,
      customer_phone: cust?.phone || null,
      provider_name: modem.connection?.provider?.name || null,
      connection_id: modem.connection_id || modem.connection?.id || null,
      mac_address: mac || modem.mac_address || null,
      occurred_on: date || undefined,
      note: note?.trim() || null,
    },
  ]);
  if (error) console.warn("Could not save the return history:", error.message);
}

// Newest first, with the unit's current details.
export async function getReturnEvents() {
  const { data, error } = await supabase
    .from("modem_events")
    .select("*, modem:modems(serial_no, mac_address, status, product:products(name))")
    .eq("event", "returned")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    // Table not created yet -> just show an empty history.
    if (/modem_events|schema cache|relation/i.test(error.message)) return [];
    throwDb(error);
  }
  return data || [];
}

// Modems collected back from one customer, newest first.
export async function getCustomerReturnEvents(customerId) {
  const { data, error } = await supabase
    .from("modem_events")
    .select("*, modem:modems(serial_no, mac_address, status, product:products(name))")
    .eq("event", "returned")
    .eq("customer_id", customerId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (/modem_events|schema cache|relation/i.test(error.message)) return [];
    throwDb(error);
  }
  return data || [];
}
