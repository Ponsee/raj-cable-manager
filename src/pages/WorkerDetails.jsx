import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import {
  getWorker,
  getWorkerTransactions,
  addWorkerTransaction,
  getWorkTypeSuggestions,
} from "../services/workersService";
import {
  calcBalance,
  calcSplicing,
  calcWireLaying,
  describeWork,
} from "../utils/workerCalc";
import {
  TRANSACTION_TYPES,
  WORKER_TYPES,
  WORK_TYPES,
  WORKER_TYPE_LABELS,
} from "../constants";
import { formatCurrency, formatDate, ordinal } from "../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const typeBadge = {
  advance: "bg-amber-100 text-amber-700",
  work: "bg-green-100 text-green-700",
  payment: "bg-blue-100 text-blue-700",
};

// Wording changes depending on whether the worker is salary or contract.
function typeInfoFor(workerType) {
  if (workerType === WORKER_TYPES.SALARY) {
    return {
      work: {
        icon: "💰",
        label: "Salary",
        help: "Record the monthly salary the worker earned. Balance goes up.",
      },
      advance: {
        icon: "💵",
        label: "Advance",
        help: "Money given early, before salary day. Balance goes down.",
      },
      payment: {
        icon: "✅",
        label: "Pay Salary",
        help: "You paid the salary to the worker. Balance goes down.",
      },
    };
  }
  return {
    work: {
      icon: "🛠️",
      label: "Work",
      help: "Worker did a job and earned money. Balance goes up.",
    },
    advance: {
      icon: "💵",
      label: "Advance",
      help: "Money given early, before payday. Balance goes down.",
    },
    payment: {
      icon: "✅",
      label: "Payment",
      help: "You paid the worker their dues. Balance goes down.",
    },
  };
}

export default function WorkerDetails() {
  const { id } = useParams();
  const [worker, setWorker] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        getWorker(id),
        getWorkerTransactions(id),
      ]);
      setWorker(w);
      setTxs(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <p className="text-gray-400">Loading worker...</p>;
  if (!worker) {
    return (
      <div>
        <p className="text-gray-500">Worker not found.</p>
        <Link to="/workers" className="text-indigo-600">
          ← Back to workers
        </Link>
      </div>
    );
  }

  const summary = calcBalance(txs);
  const info = typeInfoFor(worker.type);
  const isSalary = worker.type === WORKER_TYPES.SALARY;

  return (
    <div>
      <Link
        to="/workers"
        className="mb-3 inline-block text-sm text-indigo-600 hover:underline"
      >
        ← Back to workers
      </Link>

      <PageHeader
        title={worker.name}
        subtitle={
          isSalary
            ? `Employee${
                worker.salary_pay_day
                  ? ` · salary due ${ordinal(worker.salary_pay_day)} of month`
                  : ""
              }`
            : `Contract worker${
                worker.work_type
                  ? " · " + worker.work_type.replace("_", " ")
                  : ""
              }`
        }
        action={
          <Button onClick={() => setModalOpen(true)}>+ Add Transaction</Button>
        }
      />

      {/* Profile + summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-gray-800">Profile</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Phone" value={worker.phone || "-"} />
            <Row label="Address" value={worker.address || "-"} />
            {isSalary && (
              <Row
                label="Monthly salary"
                value={formatCurrency(worker.monthly_salary)}
              />
            )}
            {isSalary && worker.salary_pay_day && (
              <Row
                label="Salary pay day"
                value={`${ordinal(worker.salary_pay_day)} of every month`}
              />
            )}
          </dl>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard
            label={isSalary ? "Total Salary" : "Total Work"}
            value={formatCurrency(summary.work)}
            icon={isSalary ? "💰" : "🛠️"}
            accent="green"
          />
          <StatCard
            label="Total Paid"
            value={formatCurrency(summary.payment)}
            icon="✅"
            accent="blue"
          />
          <StatCard
            label="Total Advance"
            value={formatCurrency(summary.advance)}
            icon="💵"
            accent="amber"
          />
          <StatCard
            label="Balance Due"
            value={formatCurrency(summary.balance)}
            icon="⚖️"
            accent={summary.balance > 0 ? "amber" : "indigo"}
          />
        </div>
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-800">
          Transaction History
        </h3>
        {txs.length === 0 ? (
          <p className="p-8 text-center text-gray-400">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {txs.map((t) => {
                  const amount =
                    t.type === TRANSACTION_TYPES.WORK
                      ? t.calculated_amount
                      : t.amount;
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge[t.type]}`}
                        >
                          {info[t.type]?.label || t.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.type === TRANSACTION_TYPES.WORK
                          ? describeWork(t)
                          : t.note || "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        worker={worker}
        info={info}
        onSaved={async () => {
          setModalOpen(false);
          await load();
        }}
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}

// ---- Add Transaction form ----
function AddTransactionModal({ open, onClose, worker, info, onSaved }) {
  const isSalary = worker.type === WORKER_TYPES.SALARY;
  const thisMonth = new Date().toISOString().slice(0, 7); // "2026-05"

  const [type, setType] = useState(TRANSACTION_TYPES.WORK);

  // Contract work category: 'splicing' | 'wire_laying' | 'custom'
  const initialCategory =
    worker.work_type === WORK_TYPES.SPLICING
      ? "splicing"
      : worker.work_type === WORK_TYPES.WIRE_LAYING
      ? "wire_laying"
      : "custom";
  const [category, setCategory] = useState(initialCategory);
  const [customName, setCustomName] = useState("");

  const [joints, setJoints] = useState("");
  const [km, setKm] = useState("");
  const [amount, setAmount] = useState("");
  const [salaryMonth, setSalaryMonth] = useState(thisMonth);
  const [leaveDays, setLeaveDays] = useState("");
  const [note, setNote] = useState("");

  // Salary breakdown with leave deduction. One day's pay = monthly salary / 30.
  const salaryGross = Number(amount) || Number(worker.monthly_salary) || 0;
  const salaryPerDay = salaryGross / 30;
  const salaryDeduction = Math.round(salaryPerDay * (Number(leaveDays) || 0));
  const salaryNet = Math.max(0, salaryGross - salaryDeduction);

  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load remembered custom work types whenever the modal opens.
  useEffect(() => {
    if (open) {
      getWorkTypeSuggestions().then(setSuggestions).catch(() => {});
    }
  }, [open]);

  // Live "Will earn" preview for work entries.
  let workPreview = 0;
  if (type === TRANSACTION_TYPES.WORK) {
    if (isSalary) workPreview = salaryNet;
    else if (category === "splicing") workPreview = calcSplicing(joints);
    else if (category === "wire_laying") workPreview = calcWireLaying(km);
    else workPreview = Number(amount) || 0;
  }

  const reset = () => {
    setType(TRANSACTION_TYPES.WORK);
    setJoints("");
    setKm("");
    setAmount("");
    setCustomName("");
    setSalaryMonth(thisMonth);
    setLeaveDays("");
    setNote("");
    setError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const payload = { worker_id: worker.id, type, note: note.trim() || null };

    if (type === TRANSACTION_TYPES.WORK) {
      if (isSalary) {
        // Employee: salary for a month, minus any leave deduction.
        if (salaryGross <= 0)
          return setError("Salary amount must be greater than 0.");
        payload.amount = salaryNet;
        payload.calculated_amount = salaryNet;
        payload.work_details = {
          salary_month: salaryMonth,
          leave_days: Number(leaveDays) || 0,
          deduction: salaryDeduction,
          gross: salaryGross,
        };
      } else if (category === "splicing") {
        const value = calcSplicing(joints);
        if (value <= 0) return setError("Enter the number of joints.");
        payload.amount = value;
        payload.calculated_amount = value;
        payload.work_details = {
          work_type: WORK_TYPES.SPLICING,
          joints: Number(joints),
        };
      } else if (category === "wire_laying") {
        const value = calcWireLaying(km);
        if (value <= 0) return setError("Enter the distance in km.");
        payload.amount = value;
        payload.calculated_amount = value;
        payload.work_details = {
          work_type: WORK_TYPES.WIRE_LAYING,
          km: Number(km),
        };
      } else {
        // Custom work type
        const name = customName.trim();
        const value = Number(amount) || 0;
        if (!name) return setError("Enter a work type name.");
        if (value <= 0) return setError("Amount must be greater than 0.");
        payload.amount = value;
        payload.calculated_amount = value;
        payload.work_details = { work_type: name, manual: true };
      }
    } else {
      // advance or payment
      const value = Number(amount) || 0;
      if (value <= 0) return setError("Amount must be greater than 0.");
      payload.amount = value;
      payload.calculated_amount = 0;
    }

    setSaving(true);
    try {
      await addWorkerTransaction(payload);
      reset();
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Transaction">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Type selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            What is this entry?
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              TRANSACTION_TYPES.WORK,
              TRANSACTION_TYPES.ADVANCE,
              TRANSACTION_TYPES.PAYMENT,
            ].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                  type === t
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="text-lg">{info[t].icon}</span>
                {info[t].label}
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {info[type].help}
          </p>
        </div>

        {/* WORK fields */}
        {type === TRANSACTION_TYPES.WORK && (
          <>
            {/* Salary worker */}
            {isSalary ? (
              <>
                <Field label="Salary for which month?">
                  <input
                    type="month"
                    value={salaryMonth}
                    onChange={(e) => setSalaryMonth(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Salary amount (₹)">
                  <input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={inputClass}
                    placeholder={String(worker.monthly_salary || "0")}
                  />
                </Field>
                <Field label="Leave days (deducted)">
                  <input
                    type="number"
                    min="0"
                    value={leaveDays}
                    onChange={(e) => setLeaveDays(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </Field>
              </>
            ) : (
              <>
                {/* Contract worker: work category */}
                <Field label="Work type">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputClass}
                  >
                    <option value="splicing">Splicing (auto: joints)</option>
                    <option value="wire_laying">Wire laying (auto: km)</option>
                    <option value="custom">Other / custom...</option>
                  </select>
                </Field>

                {category === "splicing" && (
                  <Field label="Number of joints">
                    <input
                      type="number"
                      min="0"
                      value={joints}
                      onChange={(e) => setJoints(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. 8"
                    />
                  </Field>
                )}

                {category === "wire_laying" && (
                  <Field label="Distance (km)">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={km}
                      onChange={(e) => setKm(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. 2"
                    />
                  </Field>
                )}

                {category === "custom" && (
                  <>
                    <Field label="Work type name">
                      <input
                        list="customWorkTypes"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Pole work, Maintenance"
                      />
                      <datalist id="customWorkTypes">
                        {suggestions.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Amount (₹)">
                      <input
                        type="number"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={inputClass}
                        placeholder="0"
                      />
                    </Field>
                  </>
                )}
              </>
            )}

            {isSalary ? (
              <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                <div className="flex justify-between">
                  <span>Salary</span>
                  <span>{formatCurrency(salaryGross)}</span>
                </div>
                {salaryDeduction > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>
                      Leave ({leaveDays} day × {formatCurrency(Math.round(salaryPerDay))})
                    </span>
                    <span>−{formatCurrency(salaryDeduction)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
                  <span>Net pay</span>
                  <span>{formatCurrency(salaryNet)}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                Will earn: <strong>{formatCurrency(workPreview)}</strong>
              </div>
            )}
          </>
        )}

        {/* ADVANCE / PAYMENT fields */}
        {type !== TRANSACTION_TYPES.WORK && (
          <Field label="Amount (₹)">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>
        )}

        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}
