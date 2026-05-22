// All the worker money math lives here, in one place, so the rules from the
// master plan are easy to find and change.
import {
  SPLICING_RATES,
  WIRE_LAYING_RATE_PER_KM,
  WORK_TYPES,
  TRANSACTION_TYPES,
} from "../constants";
import { formatMonth } from "./format";

// Turn a stored work_type key into nice text. Custom types pass through as-is.
export function prettyWorkType(workType) {
  if (workType === WORK_TYPES.SPLICING) return "Splicing";
  if (workType === WORK_TYPES.WIRE_LAYING) return "Wire laying";
  return workType || "";
}

// Splicing: up to 4 joints -> ₹100 each, 5 or more -> ₹90 each.
export function calcSplicing(joints) {
  const n = Number(joints) || 0;
  const rate =
    n <= SPLICING_RATES.LOW_JOINT_LIMIT
      ? SPLICING_RATES.LOW_RATE
      : SPLICING_RATES.HIGH_RATE;
  return n * rate;
}

// Wire laying: ₹3500 per km.
export function calcWireLaying(km) {
  return (Number(km) || 0) * WIRE_LAYING_RATE_PER_KM;
}

// Given a work type + the numbers entered, return the amount earned and the
// details we store (so history shows "8 joints" or "2 km" later).
export function calcWork(workType, inputs) {
  if (workType === WORK_TYPES.SPLICING) {
    const joints = Number(inputs.joints) || 0;
    return { amount: calcSplicing(joints), details: { joints } };
  }
  if (workType === WORK_TYPES.WIRE_LAYING) {
    const km = Number(inputs.km) || 0;
    return { amount: calcWireLaying(km), details: { km } };
  }
  // "other" (or salary worker) -> amount typed in directly.
  const amount = Number(inputs.amount) || 0;
  return { amount, details: { manual: true } };
}

// Worker balance = total work earned − total paid − total advance.
// A positive balance means we still owe the worker money.
export function calcBalance(transactions = []) {
  let work = 0;
  let payment = 0;
  let advance = 0;

  for (const t of transactions) {
    if (t.type === TRANSACTION_TYPES.WORK)
      work += Number(t.calculated_amount) || 0;
    else if (t.type === TRANSACTION_TYPES.PAYMENT)
      payment += Number(t.amount) || 0;
    else if (t.type === TRANSACTION_TYPES.ADVANCE)
      advance += Number(t.amount) || 0;
  }

  return { work, payment, advance, balance: work - payment - advance };
}

// Turns a transaction's stored details into a readable line for the table.
export function describeWork(tx) {
  const d = tx.work_details || {};
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
