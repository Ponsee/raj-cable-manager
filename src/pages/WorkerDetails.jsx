import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import WorkerForm, {
  DEFAULT_PRICING_FORM,
  buildPricing,
  pricingToFormFields,
} from "../components/forms/WorkerForm";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  getWorker,
  getWorkerTransactions,
  addWorkerTransaction,
  updateWorker,
  deleteWorkerTransaction,
} from "../services/workersService";
import { calcBalance, calcSplicing, describeWork } from "../utils/workerCalc";
import {
  TRANSACTION_TYPES,
  WORKER_TYPES,
  WORK_TYPES,
  PAYMENT_METHODS_SPLIT,
  PAYMENT_SPLIT,
} from "../constants";
import { formatCurrency, formatDate, ordinal } from "../utils/format";
import DateRangePicker, {
  inRange,
  currentMonthRange,
} from "../components/ui/DateRangePicker";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Combine a chosen date ("YYYY-MM-DD") with the current time so same-day entries
// keep their order. Empty → undefined (DB defaults created_at to now()).
function txTimestamp(dateStr) {
  if (!dateStr) return undefined;
  const now = new Date();
  const d = new Date(dateStr);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d.toISOString();
}

const typeBadge = {
  advance: "bg-amber-100 text-amber-700",
  work: "bg-green-100 text-green-700",
  payment: "bg-blue-100 text-blue-700",
  salary: "bg-green-100 text-green-700",
  bonus: "bg-purple-100 text-purple-700",
  increment: "bg-indigo-100 text-indigo-700",
  expense: "bg-orange-100 text-orange-700",
};

// Purpose options for an Expense entry (petrol / other money given).
const EXPENSE_PURPOSES = ["Petrol", "Food", "Travel", "Material", "Other"];

// Shared "Expense" type info (used by both employee and contractor).
const EXPENSE_TYPE_INFO = {
  icon: "⛽",
  label: "Expense",
  help: "Petrol / other money given for work. NOT deducted from pay.",
};

// For salary workers, 3 options: Advance, Salary, Bonus
export function typeInfoFor(workerType) {
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
        help: "Extra one-time payment on top of salary (festival, reward, etc.).",
      },
      increment: {
        icon: "📈",
        label: "Increment",
        help: "Give a raise. Updates the monthly salary from now on.",
      },
      expense: EXPENSE_TYPE_INFO,
    };
  }
  return {
    work: {
      icon: "🛠️",
      label: "Work",
      help: "Splicing done (per joint). Advance can be reduced from the payout.",
    },
    advance: {
      icon: "💵",
      label: "Advance",
      help: "Money given early. Reduce it later when recording work.",
    },
    bonus: {
      icon: "🎁",
      label: "Bonus",
      help: "Extra one-time payment on top of work.",
    },
    expense: EXPENSE_TYPE_INFO,
  };
}

// Short, plain-English line of a contract worker's rates (for the profile).
function pricingSummary(worker) {
  const p = worker.pricing || {};
  if (worker.work_type === WORK_TYPES.SPLICING) {
    const limit = p.low_joint_limit ?? 4;
    const low = p.low_rate ?? 100;
    const high = p.high_rate ?? 90;
    return `Up to ${limit} joints: ${formatCurrency(low)} per joint. More than ${limit} joints: ${formatCurrency(high)} per joint.`;
  }
  if (worker.work_type === WORK_TYPES.WIRE_LAYING) {
    return `${formatCurrency(p.rate_per_km ?? 3500)} per km`;
  }
  return "Entered for each work entry";
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
  const [incrementModalOpen, setIncrementModalOpen] = useState(false); // increment history
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState(currentMonthRange());
  const [confirmTx, setConfirmTx] = useState(null); // transaction to delete
  const [deletingTx, setDeletingTx] = useState(false);

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

  const doDeleteTx = async () => {
    setDeletingTx(true);
    try {
      await deleteWorkerTransaction(confirmTx);
      setConfirmTx(null);
      await load();
    } finally {
      setDeletingTx(false);
    }
  };

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

  const summary = calcBalance(txs, worker.type);
  const info = typeInfoFor(worker.type);
  const isSalary = worker.type === WORKER_TYPES.SALARY;

  // Advance given in the current calendar month (shown alongside total advance).
  const nowMonth = (() => {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  })();
  const monthName = new Date().toLocaleString("en-IN", { month: "long" });
  const thisMonthAdvance = txs
    .filter(
      (t) =>
        t.type === TRANSACTION_TYPES.ADVANCE &&
        (() => {
          const d = new Date(t.created_at);
          return d.getFullYear() * 12 + d.getMonth() === nowMonth;
        })()
    )
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Find latest increment transaction for salary workers
  const incrementTxs = txs.filter((t) => t.type === "increment");
  const lastIncrement = incrementTxs[0];
  const incrementDiff = lastIncrement
    ? (Number(lastIncrement.work_details?.new_salary) || 0) -
      (Number(lastIncrement.work_details?.old_salary) || 0)
    : 0;

  // Filter transactions by date
  const filteredTxs = txs.filter((t) =>
    inRange(t.created_at, dateFilter.start, dateFilter.end)
  );

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
            {!isSalary && (
              <Row label="Pricing" value={pricingSummary(worker)} />
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
                label="Total Bonus"
                value={formatCurrency(summary.bonus)}
                icon="🎁"
                accent="purple"
                onClick={() => setBonusModalOpen(true)}
              />
              <StatCard
                label="Increment"
                value={incrementDiff > 0 ? `+${formatCurrency(incrementDiff)}` : "-"}
                icon="📈"
                accent="indigo"
                onClick={() => setIncrementModalOpen(true)}
              />
              <StatCard
                label="Total Advance"
                value={formatCurrency(summary.advance)}
                icon="💵"
                accent="amber"
                onClick={() => setAdvanceModalOpen(true)}
              >
                <p className="mt-1 text-xs text-gray-500">
                  {monthName}: {formatCurrency(thisMonthAdvance)}
                </p>
              </StatCard>
              <StatCard
                label="Balance Due"
                value={formatCurrency(summary.balance)}
                icon="⚖️"
                accent={summary.balance > 0 ? "amber" : "indigo"}
                onClick={() => setBalanceModalOpen(true)}
              />
              <StatCard
                label="Total Expense"
                value={formatCurrency(summary.expense)}
                icon="⛽"
                accent="orange"
                onClick={() => setExpenseModalOpen(true)}
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
                label="Total Bonus"
                value={formatCurrency(summary.bonus)}
                icon="🎁"
                accent="purple"
                onClick={() => setBonusModalOpen(true)}
              />
              <StatCard
                label="Total Advance"
                value={formatCurrency(summary.advance)}
                icon="💵"
                accent="amber"
                onClick={() => setAdvanceModalOpen(true)}
              >
                <p className="mt-1 text-xs text-gray-500">
                  {monthName}: {formatCurrency(thisMonthAdvance)}
                </p>
              </StatCard>
              <StatCard
                label="Balance Due"
                value={formatCurrency(summary.balance)}
                icon="⚖️"
                accent={summary.balance > 0 ? "amber" : "indigo"}
                onClick={() => setBalanceModalOpen(true)}
              />
              <StatCard
                label="Total Expense"
                value={formatCurrency(summary.expense)}
                icon="⛽"
                accent="orange"
                onClick={() => setExpenseModalOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3"></th>
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
                        {t.note ||
                          (t.type === TRANSACTION_TYPES.WORK
                            ? describeWork(t)
                            : "-")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(amount)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Tooltip title="Delete entry">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setConfirmTx(t)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
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

      <HistoryModal
        open={advanceModalOpen}
        onClose={() => setAdvanceModalOpen(false)}
        title="Advance History"
        txs={txs}
        filter={(t) => t.type === TRANSACTION_TYPES.ADVANCE}
        describe={(t) => t.note || "Advance"}
        amount={(t) => t.amount || 0}
        color="text-amber-600"
        emptyText="No advances in this period."
      />

      <HistoryModal
        open={balanceModalOpen}
        onClose={() => setBalanceModalOpen(false)}
        title="Balance Reduction History"
        txs={txs}
        filter={(t) => t.work_details?.advance_reduced}
        describe={(t) =>
          t.type === "work" ? "Advance reduced by work" : "Advance reduced by salary"
        }
        amount={(t) => t.work_details?.advance_reduced || 0}
        displayAmount={(t) =>
          `−${formatCurrency(t.work_details?.advance_reduced || 0)}`
        }
        color="text-green-600"
        totalLabel="Total Reduced"
        emptyText="No balance reductions in this period."
      />

      <HistoryModal
        open={bonusModalOpen}
        onClose={() => setBonusModalOpen(false)}
        title="Bonus History"
        txs={txs}
        filter={(t) => t.type === "bonus"}
        describe={(t) => t.note || "Bonus"}
        amount={(t) => t.amount || 0}
        color="text-purple-600"
        emptyText="No bonuses in this period."
      />

      <HistoryModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title="Expense History"
        txs={txs}
        filter={(t) => t.type === "expense"}
        describe={(t) => t.work_details?.purpose || "Expense"}
        amount={(t) => t.amount || 0}
        color="text-orange-600"
        emptyText="No expenses in this period."
      />

      <HistoryModal
        open={salaryModalOpen}
        onClose={() => setSalaryModalOpen(false)}
        title="Salary History"
        txs={txs}
        filter={(t) => t.type === "salary"}
        describe={(t) => describeWork(t)}
        amount={(t) => t.amount || 0}
        color="text-green-600"
        emptyText="No salaries in this period."
      />

      <HistoryModal
        open={incrementModalOpen}
        onClose={() => setIncrementModalOpen(false)}
        title="Increment History"
        txs={txs}
        filter={(t) => t.type === "increment"}
        describe={(t) =>
          `${formatCurrency(t.work_details?.old_salary || 0)} → ${formatCurrency(
            t.work_details?.new_salary || 0
          )}`
        }
        amount={(t) =>
          (Number(t.work_details?.new_salary) || 0) -
          (Number(t.work_details?.old_salary) || 0)
        }
        displayAmount={(t) =>
          `+${formatCurrency(
            (Number(t.work_details?.new_salary) || 0) -
              (Number(t.work_details?.old_salary) || 0)
          )}`
        }
        color="text-indigo-600"
        totalLabel="Total Increase"
        emptyText="No increments yet."
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

      <ConfirmDialog
        open={!!confirmTx}
        onClose={() => setConfirmTx(null)}
        onConfirm={doDeleteTx}
        title="Delete this transaction?"
        message="This removes the worker entry and, if it created an expense, that expense too. Balances recalculate. This cannot be undone."
        confirmLabel="Delete"
        loading={deletingTx}
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
export function AddTransactionModal({
  open,
  onClose,
  worker,
  info,
  onSaved,
  title = "Add Transaction",
  onBack,
}) {
  const isSalary = worker.type === WORKER_TYPES.SALARY;

  // Type options per worker kind (Expense applies to both).
  const typeOptions = isSalary
    ? ["salary", "advance", "bonus", "increment", "expense"]
    : [TRANSACTION_TYPES.WORK, TRANSACTION_TYPES.ADVANCE, "bonus", "expense"];

  // Start with salary for employees, work for contract
  const initialType = isSalary ? "salary" : TRANSACTION_TYPES.WORK;
  const [type, setType] = useState(initialType);

  const [joints, setJoints] = useState("");
  const [amount, setAmount] = useState("");
  const [salaryDate, setSalaryDate] = useState(new Date().toISOString().split("T")[0]);
  const [leaveDays, setLeaveDays] = useState("");
  const [newSalary, setNewSalary] = useState(""); // for increment
  const [purpose, setPurpose] = useState(EXPENSE_PURPOSES[0]); // for expense
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS_SPLIT[0]); // Cash by default
  const [cashAmount, setCashAmount] = useState(""); // for Split
  const [onlineAmount, setOnlineAmount] = useState(""); // for Split
  const [note, setNote] = useState("");

  // Advance figures loaded when the modal opens.
  const [totalAdvance, setTotalAdvance] = useState(0); // gross advances given
  const [outstandingAdvance, setOutstandingAdvance] = useState(0); // given − reduced

  // Salary calculation: monthly salary - leave deduction - advance reduced
  const salaryBase = Number(worker.monthly_salary) || 0;
  const salaryPerDay = Math.round(salaryBase / 30);
  const leaveDeduction = salaryPerDay * (Number(leaveDays) || 0);
  const advanceReduced = Number(amount) || 0;
  const salaryNet = Math.max(0, salaryBase - leaveDeduction - advanceReduced);

  // Contractor work payout: gross (per joint) − advance reduced = net to pay.
  const workGross = calcSplicing(joints, worker.pricing);
  const workNet = Math.max(0, workGross - advanceReduced);

  // Actual cash leaving the business for this entry (what a Split must add up to).
  const payAmount =
    type === "salary"
      ? salaryNet
      : type === TRANSACTION_TYPES.WORK
      ? workNet
      : type === "increment"
      ? 0
      : Number(amount) || 0;

  // Load advance figures when the modal opens.
  useEffect(() => {
    if (open && worker?.id) {
      getWorkerTransactions(worker.id).then((txs) => {
        const given = txs
          .filter((t) => t.type === TRANSACTION_TYPES.ADVANCE)
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const reduced = txs.reduce(
          (sum, t) => sum + (Number(t.work_details?.advance_reduced) || 0),
          0
        );
        setTotalAdvance(given);
        setOutstandingAdvance(Math.max(0, given - reduced));
      });
    }
  }, [open, worker?.id]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Build the auto note from whatever is entered — for every type.
  const buildNote = () => {
    const parts = [];
    const monthYear = salaryDate
      ? new Date(salaryDate).toLocaleString("en-IN", {
          month: "long",
          year: "numeric",
        })
      : "";

    if (type === "salary") {
      if (monthYear) parts.push(monthYear);
      if (Number(leaveDays) > 0) parts.push(`${leaveDays} day leave`);
      if (Number(amount) > 0) {
        parts.push(`Advance reduced: ${formatCurrency(Number(amount))}`);
        parts.push(
          `Remaining advance: ${formatCurrency(
            Math.max(0, totalAdvance - Number(amount))
          )}`
        );
      }
      if (salaryBase > 0) parts.push(`Net paid: ${formatCurrency(salaryNet)}`);
    } else if (type === TRANSACTION_TYPES.WORK) {
      if (Number(joints) > 0) parts.push(`${joints} joints`);
      if (Number(amount) > 0) {
        parts.push(`Advance reduced: ${formatCurrency(Number(amount))}`);
        parts.push(
          `Remaining advance: ${formatCurrency(
            Math.max(0, outstandingAdvance - Number(amount))
          )}`
        );
      }
      if (workGross > 0) parts.push(`Net paid: ${formatCurrency(workNet)}`);
    } else if (type === "bonus") {
      if (monthYear) parts.push(monthYear);
      if (Number(amount) > 0)
        parts.push(`Bonus: ${formatCurrency(Number(amount))}`);
    } else if (type === "increment") {
      if (Number(newSalary) > 0)
        parts.push(
          `Increment: ${formatCurrency(salaryBase)} → ${formatCurrency(
            Number(newSalary)
          )}`
        );
    } else if (type === TRANSACTION_TYPES.ADVANCE) {
      if (Number(amount) > 0)
        parts.push(`Advance: ${formatCurrency(Number(amount))}`);
    } else if (type === "expense") {
      parts.push(purpose);
      if (Number(amount) > 0) parts.push(formatCurrency(Number(amount)));
    }
    return parts.join(", ");
  };

  // Keep the note field auto-filled as the user types (they can still edit it).
  useEffect(() => {
    const n = buildNote();
    if (n) setNote(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, salaryDate, leaveDays, amount, joints, newSalary, purpose]);

  const reset = () => {
    setType(isSalary ? "salary" : TRANSACTION_TYPES.WORK);
    setJoints("");
    setAmount("");
    setSalaryDate(new Date().toISOString().split("T")[0]);
    setLeaveDays("");
    setNewSalary("");
    setPurpose(EXPENSE_PURPOSES[0]);
    setPaymentMethod(PAYMENT_METHODS_SPLIT[0]);
    setCashAmount("");
    setOnlineAmount("");
    setNote("");
    setError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    // Use the typed note, or build it now so the auto-note always saves even if
    // the effect hadn't run yet (e.g. saving immediately after typing).
    const finalNote = note.trim() || buildNote();
    const payload = {
      worker_id: worker.id,
      type,
      note: finalNote || null,
      // How the pay went out (Cash/Online) — flows to the auto-created expense too.
      payment_method: paymentMethod,
      // Record on the chosen date (keep current time so same-day rows stay ordered).
      ...(salaryDate ? { created_at: txTimestamp(salaryDate) } : {}),
    };

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
    } else if (type === "bonus") {
      // Employee bonus: extra one-time payment
      const value = Number(amount) || 0;
      if (value <= 0) return setError("Bonus amount must be greater than 0.");
      payload.type = "bonus";
      payload.amount = value;
      payload.calculated_amount = value;
      payload.work_details = { bonus_date: salaryDate };
    } else if (type === "increment") {
      // Employee raise: records old -> new and updates base salary below
      const newSal = Number(newSalary) || 0;
      if (newSal <= 0) return setError("Enter the new salary amount.");
      payload.type = "increment";
      payload.amount = 0;
      payload.calculated_amount = newSal;
      payload.work_details = {
        old_salary: salaryBase,
        new_salary: newSal,
      };
    } else if (type === "expense") {
      // Petrol / other money given — recorded, but NOT deducted from pay.
      const value = Number(amount) || 0;
      if (value <= 0) return setError("Amount must be greater than 0.");
      payload.type = "expense";
      payload.amount = value;
      payload.calculated_amount = 0;
      payload.work_details = { purpose };
    } else if (type === TRANSACTION_TYPES.WORK) {
      // Contract worker: splicing per joint, optionally settling advance.
      if (workGross <= 0) return setError("Enter the number of joints.");
      if (advanceReduced > outstandingAdvance)
        return setError(
          "Advance to reduce is more than the outstanding advance."
        );
      payload.amount = workGross;
      payload.calculated_amount = workGross;
      payload.work_details = {
        work_type: WORK_TYPES.SPLICING,
        joints: Number(joints),
        advance_reduced: advanceReduced,
        net: workNet,
      };
    } else {
      // advance or payment
      const value = Number(amount) || 0;
      if (value <= 0) return setError("Amount must be greater than 0.");
      payload.amount = value;
      payload.calculated_amount = 0;
    }

    // Split payment: Cash + Online must add up to the cash actually paid out.
    let cashAmt = 0;
    let onlineAmt = 0;
    if (paymentMethod === PAYMENT_SPLIT) {
      cashAmt = Number(cashAmount) || 0;
      onlineAmt = Number(onlineAmount) || 0;
      if (Math.round(cashAmt + onlineAmt) !== Math.round(payAmount))
        return setError(
          `Cash + Online must add up to ${formatCurrency(payAmount)}.`
        );
      const breakdown = `Cash ${formatCurrency(cashAmt)} + Online ${formatCurrency(
        onlineAmt
      )}`;
      payload.note = payload.note ? `${payload.note}, ${breakdown}` : breakdown;
    }

    setSaving(true);
    try {
      await addWorkerTransaction(payload, {
        workerName: worker.name,
        cashAmount: cashAmt,
        onlineAmount: onlineAmt,
      });
      // Increment also bumps the worker's stored monthly salary going forward.
      if (type === "increment") {
        await updateWorker(worker.id, { monthly_salary: payload.calculated_amount });
      }
      reset();
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSave} className="space-y-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back
          </button>
        )}
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
          <div
            className={`grid gap-2 ${
              isSalary ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"
            }`}
          >
            {typeOptions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  // Switching type starts with a clean slate for its own fields.
                  setType(t);
                  setAmount("");
                  setJoints("");
                  setLeaveDays("");
                  setNewSalary("");
                  setPurpose(EXPENSE_PURPOSES[0]);
                  setNote("");
                  setError("");
                }}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-3 text-xs font-medium transition sm:text-sm ${
                  type === t
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="text-2xl">{info[t].icon}</span>
                {info[t].label}
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {info[type].help}
          </p>
        </div>

        {/* Date — applies to every transaction type (default: today) */}
        <Field label="Date">
          <input
            type="date"
            value={salaryDate}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => setSalaryDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        {/* Paid via — Cash / Online / Split (skip increment: a raise, no cash out) */}
        {type !== "increment" && (
          <Field label="Paid via">
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS_SPLIT.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    paymentMethod === m
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {paymentMethod === PAYMENT_SPLIT && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Cash (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={payAmount}
                    step="any"
                    value={cashAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCashAmount(v);
                      // Auto-fill the Online part as whatever's left of the pay.
                      setOnlineAmount(
                        String(Math.max(0, payAmount - (Number(v) || 0)))
                      );
                    }}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Online (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={payAmount}
                    step="any"
                    value={onlineAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOnlineAmount(v);
                      // Auto-fill the Cash part as whatever's left of the pay.
                      setCashAmount(
                        String(Math.max(0, payAmount - (Number(v) || 0)))
                      );
                    }}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-500">
                  Should add up to {formatCurrency(payAmount)} — entered{" "}
                  {formatCurrency(
                    (Number(cashAmount) || 0) + (Number(onlineAmount) || 0)
                  )}
                  .
                </p>
              </div>
            )}
          </Field>
        )}

        {/* SALARY fields for employee */}
        {type === "salary" && isSalary && (
          <>
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
              {totalAdvance > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Remaining advance</span>
                  <span>
                    {formatCurrency(Math.max(0, totalAdvance - (Number(amount) || 0)))}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
                <span>Net salary to pay</span>
                <span>{formatCurrency(salaryNet)}</span>
              </div>
            </div>
          </>
        )}

        {/* BONUS fields (employee + contractor) */}
        {type === "bonus" && (
          <>
            <Field label="Bonus amount (₹)">
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
                placeholder="e.g. 2000"
              />
            </Field>
            <div className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-800">
              Bonus to pay: <strong>{formatCurrency(Number(amount) || 0)}</strong>
            </div>
          </>
        )}

        {/* INCREMENT fields for employee */}
        {type === "increment" && isSalary && (
          <>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">Current salary: </span>
              <strong>{formatCurrency(salaryBase)}</strong>
            </div>
            <Field label="New monthly salary (₹)">
              <input
                type="number"
                min="0"
                value={newSalary}
                onChange={(e) => setNewSalary(e.target.value)}
                className={inputClass}
                placeholder="Enter new monthly salary"
              />
            </Field>
            {Number(newSalary) > salaryBase && (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                Increase: <strong>+{formatCurrency(Number(newSalary) - salaryBase)}</strong>
              </div>
            )}
          </>
        )}

        {/* WORK fields for contract worker — splicing per joint, settle advance */}
        {type === TRANSACTION_TYPES.WORK && !isSalary && (
          <>
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
            {outstandingAdvance > 0 && (
              <Field label="Advance to reduce (₹)">
                <input
                  type="number"
                  min="0"
                  max={outstandingAdvance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
            )}
            <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              <div className="flex justify-between">
                <span>Work earned ({Number(joints) || 0} joints)</span>
                <span>{formatCurrency(workGross)}</span>
              </div>
              {outstandingAdvance > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Current advance</span>
                  <span>{formatCurrency(outstandingAdvance)}</span>
                </div>
              )}
              {advanceReduced > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Reduce from advance</span>
                  <span>−{formatCurrency(advanceReduced)}</span>
                </div>
              )}
              {outstandingAdvance > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Remaining advance</span>
                  <span>
                    {formatCurrency(Math.max(0, outstandingAdvance - advanceReduced))}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
                <span>Net to pay</span>
                <span>{formatCurrency(workNet)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">Rate: {pricingSummary(worker)}</p>
          </>
        )}

        {/* ADVANCE fields */}
        {type === TRANSACTION_TYPES.ADVANCE && (
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

        {/* EXPENSE fields (petrol / other money given — not deducted) */}
        {type === "expense" && (
          <>
            <Field label="Purpose">
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className={inputClass}
              >
                {EXPENSE_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
            <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
              {formatCurrency(Number(amount) || 0)} for {purpose} — not deducted
              from pay.
            </div>
          </>
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
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---- History Modals ----

// One reusable history popup for Advance / Salary / Bonus / Increment / Balance.
// It keeps its OWN date range (independent of the page's filter) so changing the
// range here never affects the main page.
function HistoryModal({
  open,
  onClose,
  title,
  txs,
  filter,
  describe,
  amount,
  displayAmount,
  color = "text-gray-900",
  totalLabel = "Total",
  emptyText = "No records in this period.",
}) {
  const [range, setRange] = useState(currentMonthRange());

  // When opened, default to the current month (same as the page + other modules).
  useEffect(() => {
    if (open) setRange(currentMonthRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = txs.filter(
    (t) => filter(t) && inRange(t.created_at, range.start, range.end)
  );
  const total = items.reduce((s, t) => s + (Number(amount(t)) || 0), 0);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="mb-4">
        <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
      </div>
      {items.length === 0 ? (
        <p className="text-gray-500">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div
              key={t.id}
              className="flex justify-between gap-3 rounded-lg border border-gray-100 p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{formatDate(t.created_at)}</p>
                <p className="truncate text-sm text-gray-500">{describe(t)}</p>
              </div>
              <p className={`shrink-0 font-semibold ${color}`}>
                {displayAmount ? displayAmount(t) : formatCurrency(amount(t))}
              </p>
            </div>
          ))}
          <div className="mt-4 flex justify-between border-t pt-2 font-semibold">
            <span>{totalLabel}</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditWorkerModal({ open, onClose, worker, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    type: WORKER_TYPES.SALARY,
    work_type: WORK_TYPES.OTHER,
    monthly_salary: "",
    salary_pay_day: "1",
    phone: "",
    address: "",
    ...DEFAULT_PRICING_FORM,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && worker) {
      setForm({
        name: worker.name || "",
        type: worker.type || WORKER_TYPES.SALARY,
        work_type: worker.work_type || WORK_TYPES.OTHER,
        monthly_salary: worker.monthly_salary ?? "",
        salary_pay_day: worker.salary_pay_day
          ? String(worker.salary_pay_day)
          : "1",
        phone: worker.phone || "",
        address: worker.address || "",
        ...pricingToFormFields(worker.pricing),
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
        type: form.type,
        work_type:
          form.type === WORKER_TYPES.CONTRACT ? form.work_type : null,
        pricing: buildPricing(form),
        monthly_salary:
          form.type === WORKER_TYPES.SALARY
            ? Number(form.monthly_salary) || 0
            : 0,
        salary_pay_day:
          form.type === WORKER_TYPES.SALARY
            ? Number(form.salary_pay_day) || null
            : null,
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

        <WorkerForm form={form} onChange={handleChange} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
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
