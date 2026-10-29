// Internet providers (BSNL, TIC Fiber ...). Each provider's `fields` is the list
// of inputs its connection form shows: {key, label, type, secret, required,
// default, column}. `column` fields fill a real connections column (username /
// password / plan_name); the rest are stored in connections.details.
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { slugifyKey } from "../utils/ftu";

export async function getProviders({ includeInactive = false } = {}) {
  let q = supabase.from("providers").select("*").order("name", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  throwDb(error);
  return data || [];
}

export async function createProvider({ name, fields = [] }) {
  const n = (name || "").trim();
  if (!n) throw new Error("Enter the provider's name.");
  const { data, error } = await supabase
    .from("providers")
    .insert([{ name: n, fields }])
    .select()
    .single();
  throwDb(error);
  return data;
}

export async function updateProvider(id, updates) {
  const { data, error } = await supabase
    .from("providers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  throwDb(error);
  return data;
}

// Replace the whole field list (rename / reorder / delete in Settings).
export function saveProviderFields(id, fields) {
  return updateProvider(id, { fields });
}

// "+ Add field": append one field to this provider's list so every connection of
// that provider gets it. Re-reads the list first so two people adding at once
// don't overwrite each other. Returns the updated provider.
export async function addProviderField(providerId, { label, type = "text", required = false }) {
  const l = (label || "").trim();
  if (!l) throw new Error("Enter a name for the field.");
  const { data: current, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .single();
  throwDb(error);

  const fields = current.fields || [];
  const base = slugifyKey(l) || "field";
  let key = base;
  for (let i = 2; fields.some((f) => f.key === key); i++) key = `${base}_${i}`;

  const field = { key, label: l, type, required };
  if (type === "secret") field.secret = true;
  return updateProvider(providerId, { fields: [...fields, field] });
}
