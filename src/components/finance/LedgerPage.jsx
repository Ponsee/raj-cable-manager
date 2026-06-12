import { useEffect, useRef, useState } from "react";
import PageHeader from "../ui/PageHeader";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import StatCard from "../ui/StatCard";
import ConfirmDialog from "../ui/ConfirmDialog";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import DateRangePicker, {
  inRange,
  currentMonthRange,
} from "../ui/DateRangePicker";
import {
  getEntries,
  addEntry,
  deleteEntry,
  getCategorySuggestions,
} from "../../services/financeService";
import { getWorkers } from "../../services/workersService";
import { getVendors } from "../../services/vendorsService";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../constants";
import {
  AddTransactionModal,
  typeInfoFor,
} from "../../pages/WorkerDetails";
import { BulkPurchaseModal } from "../../pages/VendorDetails";
import { formatCurrency, formatDate } from "../../utils/format";
import { exportMonthlyExcel } from "../../utils/excel";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const todayStr = () => new Date().toISOString().split("T")[0];
const dayKey = (ts) => new Date(ts).toISOString().split("T")[0];

// One reusable money ledger, used by both Income and Expense.
// config: { table, title, subtitle, addLabel, accent, categories, totalLabel }
export default function LedgerPage({ config }) {
  const {
    table,
    title,
    subtitle,
    addLabel,
    accent,
    categories,
    totalLabel,
    lockedCategories = [],
    lockedHint = "",
    unifiedAdd = false, // expense: also add worker pay / product purchase
  } = config;

  const { role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(currentMonthRange());
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [kindOpen, setKindOpen] = useState(false); // "what to add" chooser
  const [chooserStart, setChooserStart] = useState(null); // reopen at a step on Back
  const [pickedWorker, setPickedWorker] = useState(null);
  const [pickedVendor, setPickedVendor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await getEntries(table));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteEntry(table, confirmId);
      setConfirmId(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  // Categories present in the list, for the filter dropdown.
  const usedCats = [...new Set(entries.map((e) => e.category).filter(Boolean))];

  const filtered = entries.filter((e) => {
    if (!inRange(e.created_at, range.start, range.end)) return false;
    if (catFilter !== "all" && e.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${e.category || ""} ${e.note || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Extra summary figures for the cards.
  const today = todayStr();
  const todayTotal = entries
    .filter((e) => dayKey(e.created_at) === today)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const dayCount = new Set(filtered.map((e) => dayKey(e.created_at))).size;
  const avgPerDay = dayCount ? total / dayCount : 0;

  // Biggest category in the current range.
  const catTotals = {};
  for (const e of filtered) {
    const c = e.category || "Uncategorised";
    catTotals[c] = (catTotals[c] || 0) + (Number(e.amount) || 0);
  }
  const catBreakdown = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const topCat = catBreakdown[0];

  // This calendar month vs last calendar month (fixed — ignores the range).
  const monthOf = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() * 12 + d.getMonth();
  };
  const nowMonth = (() => {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  })();
  const sumForMonth = (m) =>
    entries
      .filter((e) => monthOf(e.created_at) === m)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const thisMonthTotal = sumForMonth(nowMonth);
  const lastMonthTotal = sumForMonth(nowMonth - 1);
  const momPct =
    lastMonthTotal > 0
      ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
      : null;

  const exportExcel = () =>
    exportMonthlyExcel({
      filename: `${table}-${todayStr()}.xlsx`,
      entries: filtered,
      shape: (e) => ({
        Date: formatDate(e.created_at),
        Category: e.category || "",
        Note: e.note || "",
        Amount: Number(e.amount) || 0,
      }),
    });

  if (loading) return <p className="text-gray-400">Loading {title}...</p>;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DateRangePicker
              start={range.start}
              end={range.end}
              onChange={setRange}
            />
            <Button
              onClick={() => {
                if (unifiedAdd) {
                  setChooserStart(null);
                  setKindOpen(true);
                } else {
                  setAddOpen(true);
                }
              }}
            >
              {addLabel}
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={totalLabel}
          value={formatCurrency(total)}
          icon={accent === "green" ? "💰" : "💸"}
          accent={accent}
        />
        <StatCard
          label="This vs last month"
          value={formatCurrency(thisMonthTotal)}
          icon="📆"
          accent="orange"
        >
          <p className="mt-1 text-xs text-gray-500">
            Last month {formatCurrency(lastMonthTotal)}
            {momPct !== null && (
              <span
                className={`ml-1 font-medium ${
                  momPct > 0 ? "text-red-600" : momPct < 0 ? "text-green-600" : "text-gray-400"
                }`}
              >
                {momPct > 0 ? "▲" : momPct < 0 ? "▼" : ""}
                {Math.abs(momPct)}%
              </span>
            )}
          </p>
        </StatCard>
        <StatCard
          label="Today"
          value={formatCurrency(todayTotal)}
          icon="📅"
          accent="amber"
        />
        <StatCard
          label="Avg / day"
          value={formatCurrency(avgPerDay)}
          icon="📈"
          accent="blue"
        />
        <StatCard
          label="Top category"
          value={topCat ? formatCurrency(topCat[1]) : formatCurrency(0)}
          icon="🏷️"
          accent="purple"
        >
          {topCat && (
            <p className="mt-1 truncate text-xs text-gray-500">{topCat[0]}</p>
          )}
        </StatCard>
        <StatCard
          label="Entries"
          value={filtered.length}
          icon="🧾"
          accent="indigo"
        />
      </div>

      {/* By-category breakdown (for the selected range) */}
      {catBreakdown.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            By category <span className="font-normal text-gray-400">(selected range)</span>
          </h3>
          <div className="space-y-2">
            {catBreakdown.map(([cat, amt]) => {
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">{cat}</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(amt)}{" "}
                      <span className="text-xs text-gray-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Filters */}
        <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or note..."
            className={inputClass + " sm:max-w-xs"}
          />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className={inputClass + " sm:w-48"}
          >
            <option value="all">All categories</option>
            {usedCats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportExcel}
            disabled={filtered.length === 0}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:ml-auto"
          >
            ⬇️ Export Excel
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No entries match the filter.
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => {
                  const locked = lockedCategories.includes(e.category);
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(e.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {e.category || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{e.note || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {locked && (
                          <span
                            title={lockedHint}
                            className="mr-2 cursor-help text-xs text-gray-400"
                          >
                            🔒 auto
                          </span>
                        )}
                        <button
                          onClick={() => setConfirmId(e.id)}
                          className="text-sm font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddEntryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        table={table}
        title={addLabel}
        defaultCategories={categories}
        onSaved={async () => {
          setAddOpen(false);
          await load();
        }}
      />

      {unifiedAdd && (
        <>
          <AddKindChooser
            open={kindOpen}
            startKind={chooserStart}
            showWorker={isAdmin}
            onClose={() => setKindOpen(false)}
            onGeneral={() => {
              setKindOpen(false);
              setAddOpen(true);
            }}
            onWorker={(w) => {
              setKindOpen(false);
              setPickedWorker(w);
            }}
            onVendor={(v) => {
              setKindOpen(false);
              setPickedVendor(v);
            }}
          />

          {pickedWorker && (
            <AddTransactionModal
              open={!!pickedWorker}
              worker={pickedWorker}
              info={typeInfoFor(pickedWorker.type)}
              title={`Add Expense › Worker pay › ${pickedWorker.name}`}
              onBack={() => {
                setPickedWorker(null);
                setChooserStart("worker");
                setKindOpen(true);
              }}
              onClose={() => setPickedWorker(null)}
              onSaved={async () => {
                setPickedWorker(null);
                await load();
              }}
            />
          )}

          {pickedVendor && (
            <BulkPurchaseModal
              open={!!pickedVendor}
              vendor={pickedVendor}
              title={`Add Expense › Product purchase › ${pickedVendor.name}`}
              onBack={() => {
                setPickedVendor(null);
                setChooserStart("vendor");
                setKindOpen(true);
              }}
              onClose={() => setPickedVendor(null)}
              onSaved={async () => {
                setPickedVendor(null);
                await load();
              }}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={doDelete}
        title={`Delete this ${title.toLowerCase()} entry?`}
        message={
          lockedCategories.includes(
            entries.find((e) => e.id === confirmId)?.category
          )
            ? "⚠️ This was auto-created from a purchase or worker entry. Deleting here removes ONLY this money record — better to delete it from its source (purchase batch / worker entry) so everything stays in sync. Continue anyway?"
            : "This removes the money record. This cannot be undone."
        }
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}

// "What do you want to add?" — general expense, worker pay, or product purchase.
function AddKindChooser({
  open,
  startKind,
  showWorker = false,
  onClose,
  onGeneral,
  onWorker,
  onVendor,
}) {
  const [kind, setKind] = useState(null); // null | "worker" | "vendor"
  const [workers, setWorkers] = useState([]);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    if (open) {
      setKind(startKind || null);
      getWorkers().then(setWorkers).catch(() => {});
      getVendors().then(setVendors).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const crumb =
    kind === "worker"
      ? "Add Expense › Worker pay"
      : kind === "vendor"
        ? "Add Expense › Product purchase"
        : "Add Expense";

  const bigBtn =
    "flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-3 py-4 text-sm font-medium text-gray-700 transition hover:border-indigo-400 hover:bg-indigo-50";

  return (
    <Modal open={open} onClose={onClose} title={crumb}>
      <div className="space-y-3">
        {!kind && (
          <>
            <p className="text-sm text-gray-500">What do you want to add?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={onGeneral} className={bigBtn}>
                <span className="text-2xl">🧾</span>
                General expense
              </button>
              {showWorker && (
                <button type="button" onClick={() => setKind("worker")} className={bigBtn}>
                  <span className="text-2xl">👷</span>
                  Worker pay
                </button>
              )}
              <button type="button" onClick={() => setKind("vendor")} className={bigBtn}>
                <span className="text-2xl">📦</span>
                Product purchase
              </button>
            </div>
          </>
        )}

        {kind === "worker" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Select worker — then record advance / salary / payment / bonus / expense
            </label>
            <Autocomplete
              options={workers}
              getOptionLabel={(w) => w?.name || ""}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              onChange={(_e, val) => val && onWorker(val)}
              renderInput={(params) => (
                <TextField {...params} size="small" placeholder="Search worker…" autoFocus />
              )}
            />
            <button
              type="button"
              onClick={() => setKind(null)}
              className="mt-3 text-sm text-indigo-600 hover:underline"
            >
              ← Back
            </button>
          </div>
        )}

        {kind === "vendor" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Select vendor — then add the products bought (records purchase + expense)
            </label>
            <Autocomplete
              options={vendors}
              getOptionLabel={(v) => v?.name || ""}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              onChange={(_e, val) => val && onVendor(val)}
              renderInput={(params) => (
                <TextField {...params} size="small" placeholder="Search vendor…" autoFocus />
              )}
            />
            <button
              type="button"
              onClick={() => setKind(null)}
              className="mt-3 text-sm text-indigo-600 hover:underline"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Batch add: one date, many expense lines (each its own category + amount + note).
function AddEntryModal({
  open,
  onClose,
  table,
  title,
  defaultCategories,
  onSaved,
}) {
  const idRef = useRef(0);
  const makeLine = () => ({
    _id: ++idRef.current,
    category: defaultCategories[0] || "",
    amount: "",
    note: "",
  });

  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDate(todayStr());
      setLines([makeLine()]);
      setError("");
      getCategorySuggestions(table).then(setSuggestions).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Defaults + any previously-used categories, de-duplicated.
  const catOptions = [...new Set([...defaultCategories, ...suggestions])];

  const updateLine = (id, patch) =>
    setLines((ls) => ls.map((l) => (l._id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, makeLine()]);
  const removeLine = (id) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l._id !== id) : ls));

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!(Number(l.amount) > 0))
        return setError(`Entry ${i + 1}: enter an amount greater than 0.`);
      if (!l.category.trim())
        return setError(`Entry ${i + 1}: choose or enter a category.`);
    }
    setSaving(true);
    try {
      for (const l of lines) {
        await addEntry(table, {
          amount: l.amount,
          category: l.category.trim(),
          note: l.note,
          date,
        });
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Date (applies to all)
          </label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass + " sm:max-w-xs"}
          />
        </div>

        <div className="max-h-[24rem] space-y-2 overflow-auto pr-1">
          {lines.map((line, i) => (
            <div
              key={line._id}
              className="space-y-2 rounded-lg border border-gray-200 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Autocomplete
                    freeSolo
                    options={catOptions}
                    value={line.category}
                    inputValue={line.category}
                    onInputChange={(_e, val) => updateLine(line._id, { category: val })}
                    size="small"
                    renderInput={(params) => (
                      <TextField {...params} label={`Entry ${i + 1} — category`} />
                    )}
                  />
                </div>
                <TextField
                  label="Amount (₹)"
                  type="number"
                  size="small"
                  value={line.amount}
                  onChange={(e) => updateLine(line._id, { amount: e.target.value })}
                  sx={{ width: 120 }}
                  inputProps={{ min: 0, step: "any" }}
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line._id)}
                    className="mt-1.5 shrink-0 px-1 text-lg text-gray-400 hover:text-red-600"
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
              <TextField
                label="Note (optional)"
                size="small"
                value={line.note}
                onChange={(e) => updateLine(line._id, { note: e.target.value })}
                fullWidth
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add another expense
        </button>

        <div className="flex justify-between rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          <span>{lines.length} expense{lines.length === 1 ? "" : "s"}</span>
          <span>{formatCurrency(total)}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Save all"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
