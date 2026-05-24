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
  updateWorker,
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

// Date Range Picker - standalone component
function DateRangePicker({ start, end, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={start}
        onChange={(e) => onChange({ ...{ start: e.target.value }, end })}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <span className="text-gray-500">to</span>
      <input
        type="date"
        value={end}
        onChange={(e) => onChange({ start, ...{ end: e.target.value } })}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
    </div>
  );
}

const typeBadge = {
  advance: "bg-amber-100 text-amber-700",
  work: "bg-green-100 text-green-700",
  payment: "bg-blue-100 text-blue-700",
  salary: "bg-green-100 text-green-700",
  bonus: "bg-purple-100 text-purple-700",
  increment: "bg-indigo-100 text-indigo-700",
};

// For salary workers, 3 options: Advance, Salary, Bonus
function typeInfoFor(workerType) {
  if (workerType === WORKER_TYPES.SALARY) {
    return {
      advance: {
        icon: "💵",
        label: "Advance",
        help: "Money given early, before salary day. Reduces final salary.",
      },
      salary: {
        icon: "💰",
        label: "Salary",
        help: "Record monthly salary. Advance deducted automatically.",
      },
      bonus: {
        icon: "🎁",
        label: "Bonus",
        help: "Additional bonus payment.",
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
  const [editWorkerModalOpen, setEditWorkerModalOpen] = useState(false);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [incrementModalOpen, setIncrementModalOpen] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

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

  // Find latest increment transaction for salary workers
  const incrementTxs = txs.filter((t) => t.type === "increment");
  const lastIncrement = incrementTxs[0];
  const incrementDiff = lastIncrement
    ? (Number(lastIncrement.work_details?.new_salary) || 0) -
      (Number(lastIncrement.work_details?.old_salary) || 0)
    : 0;

  // Filter transactions by date
  const filteredTxs = txs.filter((t) => {
    const date = new Date(t.created_at).toISOString().split("T")[0];
    return date >= dateFilter.start && date <= dateFilter.end;
  });

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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Profile</h3>
            <button
              onClick={() => setEditWorkerModalOpen(true)}
              className="text-sm text-indigo-600 hover:underline"
            >
              Edit
            </button>
          </div>
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
          {isSalary ? (
            <>
              <StatCard
                label="Total Salary"
                value={formatCurrency(summary.salary)}
                icon="💰"
                accent="green"
                onClick={() => setSalaryModalOpen(true)}
              />
              <StatCard
                label="Increment"
                value={incrementDiff > 0 ? `+${formatCurrency(incrementDiff)}` : "-"}
                icon="📈"
                accent="indigo"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIncrementModalOpen(true);
                  }}
                  className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
                  title="Add Increment"
                >
                  +
                </button>
              </StatCard>
              <StatCard
                label="Total Advance"
                value={formatCurrency(summary.advance)}
                icon="💵"
                accent="amber"
                onClick={() => setAdvanceModalOpen(true)}
              />
              <StatCard
                label="Balance Due"
                value={formatCurrency(summary.balance)}
                icon="⚖️"
                accent={summary.balance > 0 ? "amber" : "indigo"}
                onClick={() => setBalanceModalOpen(true)}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Total Work"
                value={formatCurrency(summary.work)}
                icon="🛠️"
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
                onClick={() => setAdvanceModalOpen(true)}
              />
              <StatCard
                label="Balance Due"
                value={formatCurrency(summary.balance)}
                icon="⚖️"
                accent={summary.balance > 0 ? "amber" : "indigo"}
                onClick={() => setBalanceModalOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-800">Transaction History</h3>
          {txs.length > 0 && (
            <DateRangePicker
              start={dateFilter.start}
              end={dateFilter.end}
              onChange={setDateFilter}
            />
          )}
        </div>
        {filteredTxs.length === 0 ? (
          <p className="p-8 text-center text-gray-400">No transactions in this period.</p>
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
                {filteredTxs.map((t) => {
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

      <AdvanceHistoryModal
        open={advanceModalOpen}
        onClose={() => setAdvanceModalOpen(false)}
        worker={worker}
        txs={txs}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />

      <BalanceHistoryModal
        open={balanceModalOpen}
        onClose={() => setBalanceModalOpen(false)}
        worker={worker}
        txs={txs}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />

      <BonusHistoryModal
        open={bonusModalOpen}
        onClose={() => setBonusModalOpen(false)}
        worker={worker}
        txs={txs}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />

      <SalaryHistoryModal
        open={salaryModalOpen}
        onClose={() => setSalaryModalOpen(false)}
        worker={worker}
        txs={txs}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />

      <SalaryIncrementModal
        open={incrementModalOpen}
        onClose={() => setIncrementModalOpen(false)}
        worker={worker}
        onSaved={async () => {
          setIncrementModalOpen(false);
          await load();
        }}
      />

      <EditWorkerModal
        open={editWorkerModalOpen}
        onClose={() => setEditWorkerModalOpen(false)}
        worker={worker}
        onSaved={async () => {
          setEditWorkerModalOpen(false);
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

// ---- Add Transaction form (employee: 2 options) ----
function AddTransactionModal({ open, onClose, worker, info, onSaved }) {
  const isSalary = worker.type === WORKER_TYPES.SALARY;

  // Type options: employees get 2 options, contract workers get 3
  const typeOptions = isSalary
    ? ["advance", "salary"]
    : [TRANSACTION_TYPES.WORK, TRANSACTION_TYPES.ADVANCE, TRANSACTION_TYPES.PAYMENT];

  // Start with salary for employees, work for contract
  const initialType = isSalary ? "salary" : TRANSACTION_TYPES.WORK;
  const [type, setType] = useState(initialType);

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
  const [salaryDate, setSalaryDate] = useState(new Date().toISOString().split("T")[0]);
  const [leaveDays, setLeaveDays] = useState("");
  const [note, setNote] = useState("");

  // For salary workers: calculate total advance from existing transactions
  const [totalAdvance, setTotalAdvance] = useState(0);

  // Salary calculation: monthly salary - leave deduction - advance reduced
  const salaryBase = Number(worker.monthly_salary) || 0;
  const salaryPerDay = Math.round(salaryBase / 30);
  const leaveDeduction = salaryPerDay * (Number(leaveDays) || 0);
  const advanceReduced = Number(amount) || 0;
  const salaryNet = Math.max(0, salaryBase - leaveDeduction - advanceReduced);

  // Load total advance when modal opens
  useEffect(() => {
    if (open && worker?.id) {
      getWorkerTransactions(worker.id).then((txs) => {
        const adv = txs
          .filter((t) => t.type === TRANSACTION_TYPES.ADVANCE)
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        setTotalAdvance(adv);
      });
    }
  }, [open, worker?.id]);

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
  if (type === "salary") {
    // Employee salary entry
    workPreview = salaryNet;
  } else if (type === TRANSACTION_TYPES.WORK) {
    if (category === "splicing") workPreview = calcSplicing(joints);
    else if (category === "wire_laying") workPreview = calcWireLaying(km);
    else workPreview = Number(amount) || 0;
  }

  // Auto-fill note for salary entries based on selected fields
  useEffect(() => {
    if (type === "salary" && isSalary) {
      const parts = [];

      // Format date nicely (e.g., "May 2026")
      if (salaryDate) {
        const d = new Date(salaryDate);
        const monthYear = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        parts.push(monthYear);
      }
      if (leaveDays && Number(leaveDays) > 0) {
        parts.push(`${leaveDays} day leave`);
      }
      if (amount && Number(amount) > 0) {
        parts.push(`Advance reduced: ${formatCurrency(Number(amount))}`);
      }
      if (parts.length > 0) {
        setNote(parts.join(", "));
      }
    }
  }, [type, salaryDate, leaveDays, amount, isSalary]);

  const reset = () => {
    setType(isSalary ? "salary" : TRANSACTION_TYPES.WORK);
    setJoints("");
    setKm("");
    setAmount("");
    setCustomName("");
    setSalaryDate(new Date().toISOString().split("T")[0]);
    setLeaveDays("");
    setNote("");
    setError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const payload = { worker_id: worker.id, type, note: note.trim() || null };

    if (type === "salary") {
      // Employee salary: monthly salary - leave deduction - advance to reduce
      if (salaryBase <= 0)
        return setError("No salary found for this worker.");
      const amountPaid = salaryNet;
      payload.type = "salary";
      payload.amount = amountPaid;
      payload.calculated_amount = amountPaid;
      payload.work_details = {
        salary_date: salaryDate,
        leave_days: Number(leaveDays) || 0,
        advance_reduced: advanceReduced,
        monthly_salary: salaryBase,
      };
    } else if (type === TRANSACTION_TYPES.WORK) {
      // Contract worker: work entry
      if (isSalary) {
        // This shouldn't happen anymore but keep as fallback
        return setError("Invalid type for employee.");
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
          <div className={`grid gap-2 ${isSalary ? "grid-cols-2" : "grid-cols-3"}`}>
            {typeOptions.map((t) => (
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

        {/* SALARY fields for employee */}
        {type === "salary" && isSalary && (
          <>
            <Field label="Date">
              <input
                type="date"
                value={salaryDate}
                onChange={(e) => setSalaryDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Advance to reduce (₹)">
              <input
                type="number"
                min="0"
                max={totalAdvance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
                placeholder="0"
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
            <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              <div className="flex justify-between">
                <span>Monthly salary</span>
                <span>{formatCurrency(salaryBase)}</span>
              </div>
              {totalAdvance > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Current advance</span>
                  <span>{formatCurrency(totalAdvance)}</span>
                </div>
              )}
              {Number(leaveDays) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Leave ({leaveDays} day × {formatCurrency(salaryPerDay)})</span>
                  <span>−{formatCurrency(leaveDeduction)}</span>
                </div>
              )}
              {Number(amount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Reduce from advance</span>
                  <span>−{formatCurrency(Number(amount))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
                <span>Net salary to pay</span>
                <span>{formatCurrency(salaryNet)}</span>
              </div>
            </div>
          </>
        )}

        {/* WORK fields for contract worker */}
        {type === TRANSACTION_TYPES.WORK && !isSalary && (
          <>
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

            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Will earn: <strong>{formatCurrency(workPreview)}</strong>
            </div>
          </>
        )}

        {/* ADVANCE / PAYMENT fields */}
        {(type === TRANSACTION_TYPES.ADVANCE || type === TRANSACTION_TYPES.PAYMENT) && (
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

// ---- History Modals ----

function AdvanceHistoryModal({ open, onClose, worker, txs, dateFilter, onDateFilterChange }) {
  const advances = txs.filter((t) => {
    if (t.type !== TRANSACTION_TYPES.ADVANCE) return false;
    const date = new Date(t.created_at).toISOString().split("T")[0];
    return date >= dateFilter.start && date <= dateFilter.end;
  });

  return (
    <Modal open={open} onClose={onClose} title="Advance History">
      <div className="mb-4">
        <DateRangePicker
          start={dateFilter.start}
          end={dateFilter.end}
          onChange={onDateFilterChange}
        />
      </div>
      {advances.length === 0 ? (
        <p className="text-gray-500">No advances in this period.</p>
      ) : (
        <div className="space-y-2">
          {advances.map((t) => (
            <div
              key={t.id}
              className="flex justify-between rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="font-medium">{formatDate(t.created_at)}</p>
                <p className="text-sm text-gray-500">{t.note || "Advance"}</p>
              </div>
              <p className="font-semibold text-amber-600">
                {formatCurrency(t.amount)}
              </p>
            </div>
          ))}
          <div className="mt-4 flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatCurrency(advances.reduce((s, t) => s + t.amount, 0))}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BalanceHistoryModal({ open, onClose, worker, txs, dateFilter, onDateFilterChange }) {
  // Show salary transactions that reduced advance
  const salaryTxs = txs.filter((t) => {
    if (t.type !== "salary" || !t.work_details?.advance_reduced) return false;
    const date = new Date(t.created_at).toISOString().split("T")[0];
    return date >= dateFilter.start && date <= dateFilter.end;
  });

  return (
    <Modal open={open} onClose={onClose} title="Balance Reduction History">
      <div className="mb-4">
        <DateRangePicker
          start={dateFilter.start}
          end={dateFilter.end}
          onChange={onDateFilterChange}
        />
      </div>
      {salaryTxs.length === 0 ? (
        <p className="text-gray-500">No balance reductions in this period.</p>
      ) : (
        <div className="space-y-2">
          {salaryTxs.map((t) => (
            <div
              key={t.id}
              className="flex justify-between rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="font-medium">
                  {formatDate(t.created_at)}
                </p>
                <p className="text-sm text-gray-500">
                  Advance reduced by salary
                </p>
              </div>
              <p className="font-semibold text-green-600">
                −{formatCurrency(t.work_details.advance_reduced)}
              </p>
            </div>
          ))}
          <div className="mt-4 flex justify-between border-t pt-2 font-semibold">
            <span>Total Reduced</span>
            <span>
              {formatCurrency(
                salaryTxs.reduce((s, t) => s + (t.work_details?.advance_reduced || 0), 0)
              )}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SalaryHistoryModal({ open, onClose, worker, txs, dateFilter, onDateFilterChange }) {
  const salaries = txs.filter((t) => {
    if (t.type !== "salary") return false;
    const date = new Date(t.created_at).toISOString().split("T")[0];
    return date >= dateFilter.start && date <= dateFilter.end;
  });

  return (
    <Modal open={open} onClose={onClose} title="Salary History">
      <div className="mb-4">
        <DateRangePicker
          start={dateFilter.start}
          end={dateFilter.end}
          onChange={onDateFilterChange}
        />
      </div>
      {salaries.length === 0 ? (
        <p className="text-gray-500">No salaries in this period.</p>
      ) : (
        <div className="space-y-2">
          {salaries.map((t) => (
            <div
              key={t.id}
              className="flex justify-between rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="font-medium">
                  {formatDate(t.created_at)}
                </p>
                <p className="text-sm text-gray-500">
                  {describeWork(t)}
                </p>
              </div>
              <p className="font-semibold text-green-600">
                {formatCurrency(t.amount)}
              </p>
            </div>
          ))}
          <div className="mt-4 flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>
              {formatCurrency(salaries.reduce((s, t) => s + t.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BonusHistoryModal({ open, onClose, worker, txs, dateFilter, onDateFilterChange }) {
  const bonuses = txs.filter((t) => {
    if (t.type !== "bonus") return false;
    const date = new Date(t.created_at).toISOString().split("T")[0];
    return date >= dateFilter.start && date <= dateFilter.end;
  });

  return (
    <Modal open={open} onClose={onClose} title="Bonus History">
      <div className="mb-4">
        <DateRangePicker
          start={dateFilter.start}
          end={dateFilter.end}
          onChange={onDateFilterChange}
        />
      </div>
      {bonuses.length === 0 ? (
        <p className="text-gray-500">No bonuses in this period.</p>
      ) : (
        <div className="space-y-2">
          {bonuses.map((t) => (
            <div
              key={t.id}
              className="flex justify-between rounded-lg border border-gray-100 p-3"
            >
              <div>
                <p className="font-medium">
                  {formatDate(t.created_at)}
                </p>
                <p className="text-sm text-gray-500">{t.note || "Bonus"}</p>
              </div>
              <p className="font-semibold text-purple-600">
                {formatCurrency(t.amount)}
              </p>
            </div>
          ))}
          <div className="mt-4 flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>
              {formatCurrency(bonuses.reduce((s, t) => s + t.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SalaryIncrementModal({ open, onClose, worker, onSaved }) {
  const [newSalary, setNewSalary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentSalary = Number(worker.monthly_salary) || 0;
  const incrementAmount = Number(newSalary) - currentSalary;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const newSal = Number(newSalary);
    if (!newSal || newSal <= 0) return setError("Enter new salary amount.");

    setSaving(true);
    try {
      await addWorkerTransaction({
        worker_id: worker.id,
        type: "increment",
        amount: 0,
        calculated_amount: newSal,
        work_details: {
          old_salary: currentSalary,
          new_salary: newSal,
        },
      });

      // Also update the worker's base salary
      await updateWorker(worker.id, { monthly_salary: newSal });

      setNewSalary("");
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Salary Increment">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-sm text-gray-600">Current salary</p>
          <p className="text-lg font-semibold">
            {formatCurrency(currentSalary)}
          </p>
        </div>

        <Field label="New salary (₹)">
          <input
            type="number"
            min="0"
            value={newSalary}
            onChange={(e) => setNewSalary(e.target.value)}
            className={inputClass}
            placeholder="Enter new monthly salary"
          />
        </Field>

        {newSalary && incrementAmount > 0 && (
          <div className="rounded-lg bg-green-50 p-3">
            <p className="text-sm text-green-700">Increase</p>
            <p className="text-lg font-semibold text-green-700">
              +{formatCurrency(incrementAmount)}
            </p>
          </div>
        )}

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

function EditWorkerModal({ open, onClose, worker, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    type: "",
    monthly_salary: "",
    salary_pay_day: "",
    phone: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && worker) {
      setForm({
        name: worker.name || "",
        type: worker.type || "",
        monthly_salary: worker.monthly_salary || "",
        salary_pay_day: worker.salary_pay_day || "",
        phone: worker.phone || "",
        address: worker.address || "",
      });
    }
  }, [open, worker]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("Name is required.");

    setSaving(true);
    try {
      await updateWorker(worker.id, {
        name: form.name.trim(),
        monthly_salary: Number(form.monthly_salary) || null,
        salary_pay_day: Number(form.salary_pay_day) || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Worker">
      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Field label="Name">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            className={inputClass}
            required
          />
        </Field>

        {worker.type === WORKER_TYPES.SALARY && (
          <>
            <Field label="Monthly salary (₹)">
              <input
                name="monthly_salary"
                type="number"
                min="0"
                value={form.monthly_salary}
                onChange={handleChange}
                className={inputClass}
              />
            </Field>
            <Field label="Salary pay day">
              <select
                name="salary_pay_day"
                value={form.salary_pay_day}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">Select day</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {ordinal(d)} of month
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="Phone">
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            className={inputClass}
          />
        </Field>

        <Field label="Address">
          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            className={inputClass}
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
