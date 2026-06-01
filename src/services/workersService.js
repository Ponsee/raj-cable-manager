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

  // work_details is needed so calcBalance can subtract advances already
  // settled from salary (work_details.advance_reduced) — otherwise the list
  // shows total advances given, not the real Balance Due.
  const { data: txs, error } = await supabase
    .from("worker_transactions")
    .select("worker_id, type, amount, calculated_amount, work_details");
  if (error) throw error;

  const byWorker = {};
  for (const t of txs) {
    (byWorker[t.worker_id] ||= []).push(t);
  }

  return workers.map((w) => ({
    ...w,
    ...calcBalance(byWorker[w.id] || [], w.type),
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

// Worker transaction types that are real money LEAVING the business, mapped to
// the Expense category they should appear under. 'increment' (a raise record)
// is NOT cash out, so it's absent here.
const WORKER_EXPENSE_CATEGORY = {
  salary: "Staff salary",
  bonus: "Staff bonus",
  expense: "Worker expense",
  advance: "Worker advance",
  payment: "Staff payment",
  work: "Contract work", // contract worker is paid the net for the work done
};

// How much cash this transaction actually pays out. For contract 'work' we use
// the NET (gross minus any advance already settled) so the advance — which was
// expensed when it was given — isn't counted twice.
function workerExpenseAmount(tx) {
  if (tx.type === "work") return Number(tx.work_details?.net) || 0;
  return Number(tx.amount) || 0;
}

// Business Rule 1: we only ever INSERT transactions, never edit old ones.
// Cash-out transactions also create a matching Expense row, so the business's
// total expenses include worker pay. Pass { workerName } to label the expense.
export async function addWorkerTransaction(tx, { workerName } = {}) {
  const { data, error } = await supabase
    .from("worker_transactions")
    .insert([tx])
    .select()
    .single();
  if (error) throw error;

  const category = WORKER_EXPENSE_CATEGORY[tx.type];
  const amount = workerExpenseAmount(tx);
  if (category && amount > 0) {
    const note = workerName ? `${category} — ${workerName}` : category;
    const { data: exp, error: e } = await supabase
      .from("expenses")
      .insert([
        {
          amount,
          category,
          note,
          ...(tx.created_at ? { created_at: tx.created_at } : {}),
        },
      ])
      .select("id")
      .single();
    if (e) throw e;
    // Link the worker transaction to its expense so a delete removes both.
    // Ignored if the expense_id column isn't there yet (migration not run).
    if (exp?.id) {
      await supabase
        .from("worker_transactions")
        .update({ expense_id: exp.id })
        .eq("id", data.id);
    }
  }

  return data;
}

// Delete a worker transaction AND its linked auto-expense (if any), so the
// worker balance and the Expense ledger both stay correct.
export async function deleteWorkerTransaction(tx) {
  if (tx.expense_id) {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", tx.expense_id);
    if (error) throw error;
  }
  const { error } = await supabase
    .from("worker_transactions")
    .delete()
    .eq("id", tx.id);
  if (error) throw error;
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
