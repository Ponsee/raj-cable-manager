import { useEffect, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import AddPendingModal from "../components/finance/AddPendingModal";
import { getProductsWithStock } from "../services/productsService";
import {
  getPending,
  collectPayment,
  deletePending,
} from "../services/pendingService";
import { formatCurrency, formatDate } from "../utils/format";
import { PAYMENT_METHODS } from "../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const todayStr = () => new Date().toISOString().split("T")[0];

// Cash / Online toggle (small buttons).
function PayToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            value === m
              ? "border-indigo-600 bg-indigo-50 text-indigo-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export default function Pending() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("open"); // open | collected | all
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(true); // group rows by customer (default on)
  const [addOpen, setAddOpen] = useState(false);
  const [collectRow, setCollectRow] = useState(null);
  const [groupCollect, setGroupCollect] = useState(null); // collect several at once
  const [confirmId, setConfirmId] = useState(null);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Load each independently so a missing pending_payments table (migration
      // not run yet) doesn't also wipe out the product list for the picker.
      const [p, prods] = await Promise.all([
        getPending().catch(() => []),
        getProductsWithStock().catch(() => []),
      ]);
      setRows(p);
      setProducts(prods);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deletePending(confirmId);
      setConfirmId(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const open = rows.filter((r) => r.balance > 0);
  const collected = rows.filter(
    (r) => r.balance <= 0 && (Number(r.total_amount) || 0) > 0
  );
  const outstanding = open.reduce((s, r) => s + r.balance, 0);
  // Open balances grouped per customer (name, case-insensitive) → how much each owes.
  const owingList = Object.values(
    open.reduce((acc, r) => {
      const name = (r.customer_name || "").trim() || "Customer";
      const key = name.toLowerCase();
      (acc[key] ||= { name, balance: 0, items: 0 });
      acc[key].balance += r.balance;
      acc[key].items += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.balance - a.balance);
  const owingCustomers = owingList.length;

  const inView =
    view === "open" ? open : view === "collected" ? collected : rows;
  // Search across customer name + item.
  const q = search.trim().toLowerCase();
  const shown = q
    ? inView.filter((r) =>
        `${r.customer_name || ""} ${r.description || ""}`.toLowerCase().includes(q)
      )
    : inView;

  // Grouped by customer → each group carries its rows + totals.
  const groups = Object.values(
    shown.reduce((acc, r) => {
      const name = (r.customer_name || "").trim() || "Customer";
      const key = name.toLowerCase();
      (acc[key] ||= { key, name, rows: [], balance: 0, total: 0 });
      acc[key].rows.push(r);
      acc[key].balance += r.balance;
      acc[key].total += Number(r.total_amount) || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.balance - a.balance || b.total - a.total);

  if (loading) return <p className="text-gray-400">Loading pending payments…</p>;

  return (
    <div>
      <PageHeader
        title="Pending Payments"
        subtitle="Money customers still owe you"
        action={<Button onClick={() => setAddOpen(true)}>+ Add Pending</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding" value={formatCurrency(outstanding)} icon="⏳" accent="red" />
        <StatCard
          label="Customers owing"
          value={owingCustomers}
          icon="👤"
          accent="amber"
          onClick={owingCustomers > 0 ? () => setCustomersOpen(true) : undefined}
        />
        <StatCard
          label="Total credit given"
          value={formatCurrency(rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0))}
          icon="🧾"
          accent="indigo"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(rows.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0))}
          icon="💰"
          accent="green"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Search + group toggle */}
        <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or item..."
            className={inputClass + " sm:max-w-xs"}
          />
          <button
            type="button"
            onClick={() => setGrouped((g) => !g)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition sm:ml-auto ${
              grouped
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            👥 Group by customer
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          {[
            { v: "open", label: `Open balances (${open.length})` },
            { v: "collected", label: `Collected (${collected.length})` },
            { v: "all", label: `All (${rows.length})` },
          ].map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                view === v
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            {q
              ? "No records match your search."
              : view === "open"
              ? "No outstanding balances. 🎉"
              : view === "collected"
              ? "Nothing collected yet."
              : "No pending records yet."}
          </p>
        ) : grouped ? (
          <div className="max-h-[34rem] divide-y divide-gray-100 overflow-auto">
            {groups.map((g) => (
              <div key={g.key}>
                {/* Group header — customer + totals + collect-many */}
                <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{g.name}</p>
                    <p className="text-xs text-gray-500">
                      {g.rows.length} item{g.rows.length === 1 ? "" : "s"} · total{" "}
                      {formatCurrency(g.total)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`text-sm font-semibold ${
                        g.balance > 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {g.balance > 0 ? formatCurrency(g.balance) : "Paid"}
                    </span>
                    {g.balance > 0 && (
                      <button
                        onClick={() => setGroupCollect(g)}
                        className="rounded-lg border border-indigo-600 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50"
                      >
                        Collect
                      </button>
                    )}
                  </div>
                </div>

                {/* Group items */}
                {g.rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2 pl-8 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-gray-700">{r.description || "—"}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(r.created_at)}
                        {r.balance <= 0 && r.settled_at
                          ? ` · collected ${formatDate(r.settled_at)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {formatCurrency(r.paid_amount)} / {formatCurrency(r.total_amount)}
                      </span>
                      {r.balance > 0 ? (
                        <span className="w-20 text-right font-semibold text-red-600">
                          {formatCurrency(r.balance)}
                        </span>
                      ) : (
                        <span className="w-20 text-right">
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                            Paid
                          </span>
                        </span>
                      )}
                      {r.balance > 0 && (
                        <button
                          onClick={() => setCollectRow(r)}
                          className="text-xs font-medium text-indigo-600 hover:underline"
                        >
                          Collect
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmId(r.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Date</th>
                  {view === "collected" && (
                    <th className="px-4 py-3">Collected on</th>
                  )}
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.customer_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.description || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(r.created_at)}
                    </td>
                    {view === "collected" && (
                      <td className="px-4 py-3 text-gray-500">
                        {r.settled_at ? formatDate(r.settled_at) : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatCurrency(r.paid_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {r.balance > 0 ? (
                        <span className="text-red-600">{formatCurrency(r.balance)}</span>
                      ) : (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                          Paid
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.balance > 0 && (
                        <button
                          onClick={() => setCollectRow(r)}
                          className="text-sm font-medium text-indigo-600 hover:underline"
                        >
                          Collect
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmId(r.id)}
                        className="ml-3 text-sm font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddPendingModal
        open={addOpen}
        products={products}
        onClose={() => setAddOpen(false)}
        onSaved={async () => {
          setAddOpen(false);
          await load();
        }}
      />

      <Modal
        open={customersOpen}
        onClose={() => setCustomersOpen(false)}
        title="Customers who owe you"
        size="sm"
      >
        {owingList.length === 0 ? (
          <p className="py-6 text-center text-gray-400">No one owes you. 🎉</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {owingList.map((c) => (
              <div key={c.name} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {c.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {c.items} item{c.items === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-red-600">
                  {formatCurrency(c.balance)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 text-sm font-semibold text-gray-800">
              <span>Total outstanding</span>
              <span className="text-red-600">{formatCurrency(outstanding)}</span>
            </div>
          </div>
        )}
      </Modal>

      <GroupCollectModal
        group={groupCollect}
        onClose={() => setGroupCollect(null)}
        onSaved={async () => {
          setGroupCollect(null);
          await load();
        }}
      />

      <CollectModal
        row={collectRow}
        onClose={() => setCollectRow(null)}
        onSaved={async () => {
          setCollectRow(null);
          await load();
        }}
      />

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={doDelete}
        title="Delete this pending record?"
        message="This removes the credit note only. Income already collected and any stock movement are NOT reversed."
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}

function CollectModal({ row, onClose, onSaved }) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (row) {
      setAmount(String(row.balance));
      setPaymentMethod(PAYMENT_METHODS[0]);
      setDate(todayStr());
      setError("");
    }
  }, [row]);

  if (!row) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    const amt = Number(amount) || 0;
    if (amt <= 0) return setError("Enter an amount.");
    if (amt > row.balance) return setError(`Balance is only ${formatCurrency(row.balance)}.`);

    setSaving(true);
    try {
      await collectPayment({ row, amount: amt, paymentMethod, date });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={`Collect from ${row.customer_name || "customer"}`} size="sm">
      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {row.description || "Sale"} · balance{" "}
          <strong className="text-red-600">{formatCurrency(row.balance)}</strong>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Collect now (₹)</label>
          <input
            type="number"
            min="0"
            max={row.balance}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Paid via</label>
          <PayToggle value={paymentMethod} onChange={setPaymentMethod} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Collect"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Collect several of one customer's pending items at once. Tick the items to
// settle — each selected item is collected in full.
function GroupCollectModal({ group, onClose, onSaved }) {
  const [selected, setSelected] = useState({});
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (group) {
      // Default: everything still owed is ticked.
      const init = {};
      for (const r of group.rows) if (r.balance > 0) init[r.id] = true;
      setSelected(init);
      setPaymentMethod(PAYMENT_METHODS[0]);
      setDate(todayStr());
      setError("");
    }
  }, [group]);

  if (!group) return null;

  const openRows = group.rows.filter((r) => r.balance > 0);
  const chosen = openRows.filter((r) => selected[r.id]);
  const total = chosen.reduce((s, r) => s + r.balance, 0);
  const allTicked = chosen.length === openRows.length && openRows.length > 0;

  const toggleAll = () => {
    const next = {};
    if (!allTicked) for (const r of openRows) next[r.id] = true;
    setSelected(next);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (chosen.length === 0) return setError("Select at least one item.");

    setSaving(true);
    try {
      // Each selected item is settled for its full balance.
      for (const r of chosen)
        await collectPayment({ row: r, amount: r.balance, paymentMethod, date });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      title={`Collect from ${group.name}`}
      size="md"
    >
      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Pick what they're paying for ({openRows.length} open)
          </p>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            {allTicked ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="max-h-64 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200">
          {openRows.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={!!selected[r.id]}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [r.id]: e.target.checked }))
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-800">{r.description || "Sale"}</p>
                <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-red-600">
                {formatCurrency(r.balance)}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Paid via</label>
          <PayToggle value={paymentMethod} onChange={setPaymentMethod} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass + " sm:max-w-xs"}
          />
        </div>

        <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <span>
            Collecting {chosen.length} item{chosen.length === 1 ? "" : "s"}
          </span>
          <span>{formatCurrency(total)}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Collect"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
