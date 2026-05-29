// All the worker money math lives here, in one place, so the rules from the
// master plan are easy to find and change.
import {
  SPLICING_RATES,
  WIRE_LAYING_RATE_PER_KM,
  WORK_TYPES,
  WORKER_TYPES,
  TRANSACTION_TYPES,
} from "../constants";
import { formatMonth, formatDate, formatCurrency } from "./format";

// Turn a stored work_type key into nice text. Custom types pass through as-is.
export function prettyWorkType(workType) {
  if (workType === WORK_TYPES.SPLICING) return "Splicing";
  if (workType === WORK_TYPES.WIRE_LAYING) return "Wire laying";
  return workType || "";
}

// Splicing: up to N joints -> low rate each, more than N -> high rate each.
// `pricing` (per-worker) overrides the global defaults when present.
export function calcSplicing(joints, pricing) {
  const n = Number(joints) || 0;
  const limit = Number(pricing?.low_joint_limit) || SPLICING_RATES.LOW_JOINT_LIMIT;
  const lowRate = Number(pricing?.low_rate) || SPLICING_RATES.LOW_RATE;
  const highRate = Number(pricing?.high_rate) || SPLICING_RATES.HIGH_RATE;
  const rate = n <= limit ? lowRate : highRate;
  return n * rate;
}

// Wire laying: rate per km (per-worker `pricing` overrides the default).
export function calcWireLaying(km, pricing) {
  const rate = Number(pricing?.rate_per_km) || WIRE_LAYING_RATE_PER_KM;
  return (Number(km) || 0) * rate;
}

// Given a work type + the numbers entered, return the amount earned and the
// details we store (so history shows "8 joints" or "2 km" later).
export function calcWork(workType, inputs, pricing) {
  if (workType === WORK_TYPES.SPLICING) {
    const joints = Number(inputs.joints) || 0;
    return { amount: calcSplicing(joints, pricing), details: { joints } };
  }
  if (workType === WORK_TYPES.WIRE_LAYING) {
    const km = Number(inputs.km) || 0;
    return { amount: calcWireLaying(km, pricing), details: { km } };
  }
  // "other" (or salary worker) -> amount typed in directly.
  const amount = Number(inputs.amount) || 0;
  return { amount, details: { manual: true } };
}

// Worker balance. The meaning depends on the worker type:
//  - Contract worker: work is paid when recorded (optionally settling advance),
//    so Balance Due = advance still outstanding (given − reduced).
//  - Employee: Balance Due = advances still outstanding (to settle from salary).
export function calcBalance(transactions = [], workerType) {
  let work = 0;
  let salary = 0;
  let payment = 0;
  let advanceGiven = 0;
  let advanceReduced = 0;
  let bonus = 0;
  let expense = 0; // petrol / other money given — NOT deducted from pay

  for (const t of transactions) {
    if (t.type === "expense") expense += Number(t.amount) || 0;
    else if (t.type === TRANSACTION_TYPES.WORK)
      work += Number(t.calculated_amount) || 0;
    else if (t.type === "salary") {
      salary += Number(t.amount) || 0;
      payment += Number(t.amount) || 0;
    }
    else if (t.type === "bonus") {
      bonus += Number(t.amount) || 0;
      payment += Number(t.amount) || 0;
    }
    else if (t.type === "increment") {
      // Increment affects payment indirectly (new salary)
      payment += Number(t.calculated_amount) || 0;
    }
    else if (t.type === TRANSACTION_TYPES.PAYMENT)
      payment += Number(t.amount) || 0;
    else if (t.type === TRANSACTION_TYPES.ADVANCE)
      advanceGiven += Number(t.amount) || 0;
    // Track advance reduced from a salary OR a work payout
    if (t.work_details?.advance_reduced)
      advanceReduced += Number(t.work_details.advance_reduced) || 0;
  }

  // Contract worker: work is settled at entry, so both the advance balance and
  // Balance Due are the advance still outstanding (given − reduced). After a work
  // payout reduces an advance, Total Advance drops too.
  if (workerType === WORKER_TYPES.CONTRACT) {
    const balance = Math.max(0, advanceGiven - advanceReduced);
    return { work, salary, bonus, payment, expense, advance: balance, balance };
  }

  // Employee: advance still outstanding (advance given − already covered).
  const balance = Math.max(0, advanceGiven - advanceReduced);
  return { work, salary, bonus, payment, expense, advance: balance, balance };
}

// Turns a transaction's stored details into a readable line for the table.
export function describeWork(tx) {
  const d = tx.work_details || {};

  // Salary transaction
  if (tx.type === "salary") {
    const date = d.salary_date ? formatDate(d.salary_date) : "This month";
    let base = `Salary · ${date}`;
    if (d.leave_days) base += ` · ${d.leave_days} day leave`;
    if (d.advance_reduced) base += ` · advance reduced`;
    return base;
  }

  // Bonus transaction
  if (tx.type === "bonus") {
    const date = d.bonus_date ? formatDate(d.bonus_date) : "This month";
    return `Bonus · ${date}`;
  }

  // Increment transaction
  if (tx.type === "increment") {
    const oldSal = d.old_salary ? formatCurrency(d.old_salary) : "-";
    const newSal = d.new_salary ? formatCurrency(d.new_salary) : "-";
    return `Increment · ${oldSal} → ${newSal}`;
  }

  if (d.salary_month) {
    const base = `Salary · ${formatMonth(d.salary_month)}`;
    return d.leave_days ? `${base} · ${d.leave_days} day leave` : base;
  }

  const label = prettyWorkType(d.work_type);
  if (d.joints != null) return `${label || "Splicing"} · ${d.joints} joints`;
  if (d.km != null) return `${label || "Wire laying"} · ${d.km} km`;
  if (label) return label;
  return tx.note || "-";
}
