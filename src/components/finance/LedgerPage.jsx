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
import { ROLES, ID_RECHARGE_CATEGORY } from "../../constants";
import {
  AddTransactionModal,
  typeInfoFor,
} from "../../pages/WorkerDetails";
import { BulkPurchaseModal } from "../../pages/VendorDetails";
import IdRechargeModal from "./IdRechargeModal";
import { formatCurrency, formatDate } from "../../utils/format";
import { exportMonthlyExcel } from "../../utils/excel";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const todayStr = () => new Date().toISOString().split("T")[0];
const dayKey = (ts) => new Date(ts).toISOString().split("T")[0];

// A month as a single comparable integer: year*12 + month(0-based).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const monthIndexOf = (ts) => {
  const d = new Date(ts);
  return d.getFullYear() * 12 + d.getMonth();
};
const monthIndexLabel = (idx) => `${MONTHS[idx % 12]} ${Math.floor(idx / 12)}`;
// The month an "ID Recharge" note is FOR, e.g. "TCCL 041 · for Jul 2026" → index.
// Falls back to null so the caller can use the paid-on date instead.
const forMonthIndex = (note) => {
  const m = String(note || "").match(/·\s*for\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return null;
  return Number(m[2]) * 12 + mi;
};
// Parse the ID (first token before " · ") from an ID-Recharge note.
const rechargeIdOf = (note) => String(note || "").split(" · ")[0].trim();

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
    paymentFilter = false, // show Cash / Online / Split filter chips
    idRecharge = false, // expense: offer the "ID Recharge" quick-add form
    // Categories kept out of the manual add dropdown but NOT locked in the table
    // (they have their own add form, e.g. ID Recharge — still freely deletable).
    hiddenCategories = [],
  } = config;

  // Filter chips for how the money moved. "All" + the payment methods.
  const PAY_CHIPS = ["all", "Cash", "Online", "Split"];
  // A row's payment method (old rows with no value count as Cash, the DB default).
  const payOf = (e) => e.payment_method || "Cash";

  // The date a row is ATTRIBUTED to for totals / month filters. Normally the
  // paid-on date (created_at). ID Recharge is special: it's deducted from the
  // month it's FOR (parsed from the note), so a recharge paid in Aug "for Jul"
  // counts under Jul — even though the list still shows its real paid date.
  const forMonthTs = (note) => {
    const idx = forMonthIndex(note);
    if (idx == null) return null;
    return new Date(Math.floor(idx / 12), idx % 12, 1).toISOString();
  };
  const attribDate = (e) =>
    idRecharge && e.category === ID_RECHARGE_CATEGORY
      ? forMonthTs(e.note) || e.created_at
      : e.created_at;

  const { role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(currentMonthRange());
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [kindOpen, setKindOpen] = useState(false); // "what to add" chooser
  const [chooserStart, setChooserStart] = useState(null); // reopen at a step on Back
  const [pickedWorker, setPickedWorker] = useState(null);
  const [pickedVendor, setPickedVendor] = useState(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);

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
    if (!inRange(attribDate(e), range.start, range.end)) return false;
    if (catFilter !== "all" && e.category !== catFilter) return false;
    if (paymentFilter && payFilter !== "all" && payOf(e) !== payFilter)
      return false;
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
      .filter((e) => monthOf(attribDate(e)) === m)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const thisMonthTotal = sumForMonth(nowMonth);
  const lastMonthTotal = sumForMonth(nowMonth - 1);
  const momPct =
    lastMonthTotal > 0
      ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
      : null;

  // ID Recharge: this-month vs last-month spend, bucketed by the month each
  // recharge is FOR (a payment made in Aug but "for Jul" counts under Jul), not
  // by when it was paid. Ignores the date-range filter — it's a fixed view.
  const rechargeSummary = (() => {
    if (!idRecharge) return null;
    const rows = entries.filter((e) => e.category === ID_RECHARGE_CATEGORY);
    const thisM = nowMonth;
    const lastM = nowMonth - 1;
    let thisTotal = 0;
    let lastTotal = 0;
    const byId = {}; // id -> { this, last }
    for (const e of rows) {
      const bucket = forMonthIndex(e.note) ?? monthIndexOf(e.created_at);
      const amt = Number(e.amount) || 0;
      const id = rechargeIdOf(e.note) || "—";
      if (!byId[id]) byId[id] = { this: 0, last: 0 };
      if (bucket === thisM) {
        thisTotal += amt;
        byId[id].this += amt;
      } else if (bucket === lastM) {
        lastTotal += amt;
        byId[id].last += amt;
      }
    }
    const perId = Object.entries(byId)
      .filter(([, v]) => v.this || v.last)
      .sort((a, b) => b[1].this + b[1].last - (a[1].this + a[1].last));
    return { thisTotal, lastTotal, thisM, lastM, perId, count: rows.length };
  })();

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

      {/* ID Recharge: this month vs last month (by the month each is FOR) */}
      {rechargeSummary && rechargeSummary.count > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span>📶</span> ID Recharge
            <span className="font-normal text-gray-400">
              (by the month each recharge is for)
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-indigo-50 px-3 py-2">
              <p className="text-xs text-indigo-500">
                This month · {monthIndexLabel(rechargeSummary.thisM)}
              </p>
              <p className="text-lg font-bold text-indigo-700">
                {formatCurrency(rechargeSummary.thisTotal)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">
                Last month · {monthIndexLabel(rechargeSummary.lastM)}
              </p>
              <p className="text-lg font-bold text-gray-700">
                {formatCurrency(rechargeSummary.lastTotal)}
              </p>
            </div>
          </div>
          {rechargeSummary.perId.length > 0 && (
            <div className="mt-3 space-y-1">
              {rechargeSummary.perId.map(([id, v]) => (
                <div
                  key={id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-700">{id}</span>
                  <span className="text-gray-500">
                    This{" "}
                    <span className="font-medium text-indigo-700">
                      {formatCurrency(v.this)}
                    </span>{" "}
                    · Last{" "}
                    <span className="font-medium text-gray-700">
                      {formatCurrency(v.last)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

        {/* Payment method filter chips (Cash / Online / Split) */}
        {paymentFilter && (
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
            <span className="text-xs font-medium text-gray-500">Paid via:</span>
            {PAY_CHIPS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPayFilter(p)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  payFilter === p
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {p === "all" ? "All" : p}
              </button>
            ))}
          </div>
        )}

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
                  {paymentFilter && <th className="px-4 py-3">Paid via</th>}
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
                      {paymentFilter && (
                        <td className="px-4 py-3 text-gray-600">
                          {payOf(e) === "Cash"
                            ? "💵 Cash"
                            : payOf(e) === "Online"
                            ? "📱 Online"
                            : payOf(e) === "Split"
                            ? `🔀 Cash ${formatCurrency(
                                Number(e.cash_amount) || 0
                              )} · Online ${formatCurrency(
                                Number(e.online_amount) || 0
                              )}`
                            : payOf(e)}
                        </td>
                      )}
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
        excludeCategories={[...lockedCategories, ...hiddenCategories]}
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
            showRecharge={idRecharge}
            onClose={() => setKindOpen(false)}
            onGeneral={() => {
              setKindOpen(false);
              setAddOpen(true);
            }}
            onRecharge={() => {
              setKindOpen(false);
              setRechargeOpen(true);
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

          {idRecharge && (
            <IdRechargeModal
              open={rechargeOpen}
              onClose={() => setRechargeOpen(false)}
              onBack={() => {
                setRechargeOpen(false);
                setChooserStart(null);
                setKindOpen(true);
              }}
              onSaved={async () => {
                setRechargeOpen(false);
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
  showRecharge = false,
  onClose,
  onGeneral,
  onRecharge,
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
              {showRecharge && (
                <button type="button" onClick={onRecharge} className={bigBtn}>
                  <span className="text-2xl">📶</span>
                  ID Recharge
                </button>
              )}
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
  excludeCategories = [],
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

  // Defaults + any previously-used categories, de-duplicated. Auto-managed ones
  // (Product purchase / Staff salary / worker / refund) are dropped — those rows
  // are created from their source, so offering them here would double-count.
  const catOptions = [...new Set([...defaultCategories, ...suggestions])].filter(
    (c) => !excludeCategories.includes(c)
  );

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
