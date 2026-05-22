// All Supabase calls related to workers live here. Pages call these
// functions instead of talking to Supabase directly.
import { supabase } from "./supabase";
import { calcBalance } from "../utils/workerCalc";

// ---- Workers ----

export async function getWorkers() {
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Workers list + each worker's balance (computed from their transactions).
export async function getWorkersWithBalance() {
  const workers = await getWorkers();

  const { data: txs, error } = await supabase
    .from("worker_transactions")
    .select("worker_id, type, amount, calculated_amount");
  if (error) throw error;

  const byWorker = {};
  for (const t of txs) {
    (byWorker[t.worker_id] ||= []).push(t);
  }

  return workers.map((w) => ({
    ...w,
    ...calcBalance(byWorker[w.id] || []),
  }));
}

export async function getWorker(id) {
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createWorker(worker) {
  const { data, error } = await supabase
    .from("workers")
    .insert([worker])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorker(id, updates) {
  const { data, error } = await supabase
    .from("workers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Worker transactions ----

export async function getWorkerTransactions(workerId) {
  const { data, error } = await supabase
    .from("worker_transactions")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Business Rule 1: we only ever INSERT transactions, never edit old ones.
export async function addWorkerTransaction(tx) {
  const { data, error } = await supabase
    .from("worker_transactions")
    .insert([tx])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Custom work types the user has typed before, so we can suggest them again.
// (Built-in splicing / wire_laying are excluded — they're always shown.)
export async function getWorkTypeSuggestions() {
  const { data, error } = await supabase
    .from("worker_transactions")
    .select("work_details")
    .eq("type", "work");
  if (error) throw error;

  const set = new Set();
  for (const row of data) {
    const wt = row.work_details?.work_type;
    if (wt && wt !== "splicing" && wt !== "wire_laying") set.add(wt);
  }
  return [...set];
}
