import { useEffect, useRef, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DateRangePicker, {
  inRange,
  currentMonthRange,
} from "../components/ui/DateRangePicker";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ProductPicker from "../components/products/ProductPicker";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import MuiButton from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import InputAdornment from "@mui/material/InputAdornment";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import {
  getEntries,
  addEntry,
  deleteIncomeEntry,
  deleteIncomeBatch,
} from "../services/financeService";
import {
  getProductsWithStock,
  addStockTransaction,
} from "../services/productsService";
import StockLossModal from "../components/products/StockLossModal";
import {
  INCOME_SOURCES,
  INTERNET_PROVIDERS,
  STOCK_TYPES,
  PAYMENT_METHODS,
} from "../constants";
import { formatCurrency, formatDate } from "../utils/format";
import { exportMonthlyExcel } from "../utils/excel";

// Income rows created for the over/short adjustment aren't a real payment.
const ADJUSTMENT_CATEGORY = "Adjustment";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const ADD_NEW = "__new__";

const todayStr = () => new Date().toISOString().split("T")[0];
const dayKey = (ts) => new Date(ts).toISOString().split("T")[0];
const srcOf = (key) => INCOME_SOURCES.find((s) => s.key === key);
// Normalise a row's payment to "Cash" or "Online" (old GPay/Other → Online).
const payOf = (e) => ((e.payment_method || "Cash") === "Cash" ? "Cash" : "Online");

// Combine a date input with the current time so same-day rows keep their order.
function tsFromDate(date) {
  if (!date) return undefined;
  const now = new Date();
  const d = new Date(date);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d.toISOString();
}

// Group income rows by calendar day, newest day first.
function groupByDay(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => {
      const cash = items
        .filter((t) => payOf(t) === "Cash")
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const total = items.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      return { key, items, cash, online: total - cash, total };
    });
}

export default function Income() {
  const [entries, setEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(currentMonthRange());
  const [search, setSearch] = useState("");
  const [payFilter, setPayFilter] = useState("all"); // "all" | "Cash" | "Online"
  const [view, setView] = useState("daily"); // "daily" | "all"
  const [addOpen, setAddOpen] = useState(false);
  const [lossOpen, setLossOpen] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState(null); // single entry to delete
  const [confirmBatch, setConfirmBatch] = useState(null); // whole day to delete
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [inc, prods] = await Promise.all([
        getEntries("income"),
        getProductsWithStock(),
      ]);
      setEntries(inc);
      setProducts(prods);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doDeleteEntry = async () => {
    setDeleting(true);
    try {
      await deleteIncomeEntry(confirmEntry);
      setConfirmEntry(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const doDeleteBatch = async () => {
    setDeleting(true);
    try {
      await deleteIncomeBatch(confirmBatch.items);
      setConfirmBatch(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const filtered = entries.filter((e) => {
    if (!inRange(e.created_at, range.start, range.end)) return false;
    if (payFilter !== "all" && payOf(e) !== payFilter) return false;
    if (search) {
      const hay = `${e.category || ""} ${e.note || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const today = todayStr();
  const todayTotal = entries
    .filter((e) => dayKey(e.created_at) === today)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Cash vs online split for the selected range (helps tally the drawer).
  // Anything that isn't cash counts as online (covers old "GPay"/"Other" rows).
  const cashTotal = filtered
    .filter((e) => payOf(e) === "Cash")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const onlineTotal = total - cashTotal;

  // Number of distinct days in range, for an average-per-day figure.
  const dayCount = new Set(filtered.map((e) => dayKey(e.created_at))).size;
  const avgPerDay = dayCount ? total / dayCount : 0;

  // This calendar month vs last (fixed — ignores the range filter).
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

  // By source (category) breakdown for the selected range.
  const srcTotals = {};
  for (const e of filtered) {
    const c = e.category || "Other";
    srcTotals[c] = (srcTotals[c] || 0) + (Number(e.amount) || 0);
  }
  const srcBreakdown = Object.entries(srcTotals).sort((a, b) => b[1] - a[1]);

  const days = groupByDay(filtered);

  const exportExcel = () =>
    exportMonthlyExcel({
      filename: `income-${today}.xlsx`,
      entries: filtered,
      shape: (e) => ({
        Date: formatDate(e.created_at),
        Source: e.category || "",
        Payment: e.payment_method || "Cash",
        Note: e.note || "",
        Amount: Number(e.amount) || 0,
      }),
    });

  if (loading) return <p className="text-gray-400">Loading income...</p>;

  return (
    <div>
      <PageHeader
        title="Income"
        subtitle="Money coming in, by source"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DateRangePicker
              start={range.start}
              end={range.end}
              onChange={setRange}
            />
            <Button variant="secondary" onClick={() => setLossOpen(true)}>
              ⚠️ Report Loss
            </Button>
            <Button onClick={() => setAddOpen(true)}>+ Add Income</Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Today's collection"
          value={formatCurrency(todayTotal)}
          icon="📅"
          accent="green"
        />
        <StatCard
          label="Total (range)"
          value={formatCurrency(total)}
          icon="💰"
          accent="indigo"
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
                  momPct > 0
                    ? "text-green-600"
                    : momPct < 0
                      ? "text-red-600"
                      : "text-gray-400"
                }`}
              >
                {momPct > 0 ? "▲" : momPct < 0 ? "▼" : ""}
                {Math.abs(momPct)}%
              </span>
            )}
          </p>
        </StatCard>
        <StatCard
          label="Cash"
          value={formatCurrency(cashTotal)}
          icon="💵"
          accent="amber"
        />
        <StatCard
          label="Online"
          value={formatCurrency(onlineTotal)}
          icon="📱"
          accent="purple"
        />
        <StatCard
          label="Avg / day"
          value={formatCurrency(avgPerDay)}
          icon="📈"
          accent="blue"
        />
        <StatCard
          label="Days with income"
          value={dayCount}
          icon="🗓️"
          accent="orange"
        />
      </div>

      {/* By-source breakdown (for the selected range) */}
      {srcBreakdown.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            By source <span className="font-normal text-gray-400">(selected range)</span>
          </h3>
          <div className="space-y-2">
            {srcBreakdown.map(([src, amt]) => {
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
              return (
                <div key={src}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">{src}</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(amt)}{" "}
                      <span className="text-xs text-gray-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1.5 rounded-full bg-green-500"
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
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: search */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search source or note..."
              className={inputClass + " sm:max-w-xs"}
            />
          </div>

          {/* Right: payment filter, view toggle, export */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={payFilter}
              onChange={(e) => setPayFilter(e.target.value)}
              className={inputClass + " sm:w-40"}
            >
              <option value="all">All payments</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="inline-flex self-start overflow-hidden rounded-lg border border-gray-200 text-sm">
              <button
                type="button"
                onClick={() => setView("daily")}
                className={`px-3 py-1.5 ${
                  view === "daily"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setView("all")}
                className={`px-3 py-1.5 ${
                  view === "all"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                All
              </button>
            </div>
            <button
              type="button"
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:self-auto"
            >
              ⬇️ Export Excel
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No income in this range.
          </p>
        ) : view === "daily" ? (
          <div className="max-h-[34rem] space-y-4 overflow-auto p-4">
            {days.map((d) => (
              <div
                key={d.key}
                className="overflow-hidden rounded-lg border border-gray-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-gray-50 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-700">
                    {formatDate(d.key)} · {d.items.length} entr
                    {d.items.length === 1 ? "y" : "ies"}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      💵 {formatCurrency(d.cash)}
                      <span className="mx-1 text-gray-300">·</span>
                      📱 {formatCurrency(d.online)}
                    </span>
                    <span className="font-semibold text-green-700">
                      {formatCurrency(d.total)}
                    </span>
                    <Tooltip title="Delete this whole day">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setConfirmBatch(d)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {d.items.map((e) => (
                      <Entry
                        key={e.id}
                        e={e}
                        onDelete={() => setConfirmEntry(e)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Pay</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <Entry
                    key={e.id}
                    e={e}
                    showDate
                    onDelete={() => setConfirmEntry(e)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddIncomeModal
        open={addOpen}
        products={products}
        onClose={() => setAddOpen(false)}
        onSaved={async () => {
          setAddOpen(false);
          await load();
        }}
      />

      <StockLossModal
        open={lossOpen}
        products={products}
        onClose={() => setLossOpen(false)}
        onSaved={async () => {
          setLossOpen(false);
          await load();
        }}
      />

      <ConfirmDialog
        open={!!confirmEntry}
        onClose={() => setConfirmEntry(null)}
        onConfirm={doDeleteEntry}
        title="Delete this income entry?"
        message="This removes the money record. If it was a product sale, that stock is added back. This cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
      />

      <ConfirmDialog
        open={!!confirmBatch}
        onClose={() => setConfirmBatch(null)}
        onConfirm={doDeleteBatch}
        title={
          confirmBatch
            ? `Delete all ${confirmBatch.items.length} entr${
                confirmBatch.items.length === 1 ? "y" : "ies"
              } for ${formatDate(confirmBatch.key)}?`
            : "Delete this day?"
        }
        message="This removes every income entry for this day. Any product stock from these sales is added back. This cannot be undone."
        confirmLabel="Delete all"
        loading={deleting}
      />
    </div>
  );
}

// Small colored chip for the payment method (Cash / Online).
function PayChip({ method }) {
  const m = (method || "Cash") === "Cash" ? "Cash" : "Online";
  const styles = {
    Cash: "bg-amber-100 text-amber-700",
    Online: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[m]}`}
    >
      {m}
    </span>
  );
}

function Entry({ e, showDate, onDelete }) {
  const isAdjust = e.category === ADJUSTMENT_CATEGORY;
  return (
    <tr>
      {showDate && (
        <td className="px-4 py-2.5 text-gray-600">{formatDate(e.created_at)}</td>
      )}
      <td className="px-4 py-2.5 text-gray-800">{e.category || "—"}</td>
      <td className="px-4 py-2.5">
        {isAdjust ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          <PayChip method={e.payment_method} />
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-600">{e.note || "—"}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
        {formatCurrency(e.amount)}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Tooltip title="Delete">
          <IconButton size="small" color="error" onClick={onDelete}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </td>
    </tr>
  );
}

// Reusable Cash / Online segmented control (MUI).
function PaymentToggle({ value, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      color="primary"
      value={value}
      onChange={(_e, v) => v && onChange(v)}
    >
      {PAYMENT_METHODS.map((m) => (
        <ToggleButton key={m} value={m} sx={{ textTransform: "none", px: 2 }}>
          {m}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}


// ---- Batch add: one date, many income lines ----

// Income this line will record (for the running total preview).
function lineIncome(line) {
  const src = srcOf(line.sourceKey);
  if (!src) return 0;
  if (src.mode === "device") {
    const items = (line.items || []).reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.sellPrice) || 0),
      0
    );
    return items + (src.charge ? Number(line.amount) || 0 : 0);
  }
  return Number(line.amount) || 0; // simple + provider
}

// Validate one line; return an error message or null.
function validateLine(line) {
  const src = srcOf(line.sourceKey);
  if (!src) return "Pick a source.";
  if (src.mode === "simple" && !(Number(line.amount) > 0))
    return `${src.label}: enter an amount.`;
  if (src.mode === "device") {
    const items = line.items || [];
    if (!items.some((it) => it.productId))
      return `${src.label}: pick at least one product.`;
    for (const it of items) {
      if (it.productId && !(Number(it.qty) > 0))
        return `${src.label}: quantity must be at least 1 for each product.`;
    }
  }
  if (src.mode === "provider") {
    const prov = line.provider === ADD_NEW ? line.newProvider.trim() : line.provider;
    if (!prov) return `${src.label}: choose a provider.`;
    if (!(Number(line.amount) > 0)) return `${src.label}: enter the recharge amount.`;
  }
  return null;
}

// Persist one line (income row, and a stock-out Sale for device lines).
async function saveLine(line, date, products) {
  const src = srcOf(line.sourceKey);
  const createdAt = tsFromDate(date);
  const paymentMethod = line.paymentMethod || PAYMENT_METHODS[0];

  if (src.mode === "simple") {
    await addEntry("income", {
      amount: line.amount,
      category: src.label,
      note: line.note,
      date,
      paymentMethod,
    });
  } else if (src.mode === "device") {
    const charge = src.charge ? Number(line.amount) || 0 : 0;
    const tag = `${src.label}${line.variant ? ` (${line.variant})` : ""}`;
    // Each product: paid -> Sale (income), free (price 0) -> Used (no income).
    for (const it of line.items || []) {
      if (!it.productId) continue;
      const q = Number(it.qty) || 0;
      const price = Number(it.sellPrice) || 0;
      const prod = products.find((p) => p.id === it.productId);
      await addStockTransaction(
        {
          product_id: it.productId,
          type: price > 0 ? STOCK_TYPES.SALE : STOCK_TYPES.USAGE,
          quantity: q,
          price_per_unit: price,
          selling_price: null,
          total_amount: q * price,
          ...(createdAt ? { created_at: createdAt } : {}),
        },
        {
          productName: prod?.name,
          incomeCategory: tag,
          incomeNote: `${tag} — ${q} × ${prod?.name}`,
          paymentMethod,
        }
      );
    }
    if (charge > 0) {
      await addEntry("income", {
        amount: charge,
        category: tag,
        note: line.note ? `${tag} charge — ${line.note}` : `${tag} install charge`,
        date,
        paymentMethod,
      });
    }
  } else if (src.mode === "provider") {
    const prov = line.provider === ADD_NEW ? line.newProvider.trim() : line.provider;
    await addEntry("income", {
      amount: line.amount,
      category: src.label,
      note: line.note ? `${prov} — ${line.note}` : prov,
      date,
      paymentMethod,
    });
  }
}

function AddIncomeModal({ open, products, onClose, onSaved }) {
  const idRef = useRef(0);
  const emptyItem = () => ({ productId: "", qty: "1", sellPrice: "" });
  const makeLine = () => ({
    _id: ++idRef.current,
    sourceKey: INCOME_SOURCES[0].key,
    amount: "",
    items: [emptyItem()],
    variant: INCOME_SOURCES[0].variants?.[0] || "",
    provider: INTERNET_PROVIDERS[0],
    newProvider: "",
    paymentMethod: PAYMENT_METHODS[0],
    note: "",
  });

  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [adjustment, setAdjustment] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDate(todayStr());
      setLines([makeLine()]);
      setAdjustment("");
      setAdjustNote("");
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (id, patch) =>
    setLines((ls) => ls.map((l) => (l._id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, makeLine()]);
  const removeLine = (id) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l._id !== id) : ls));

  const linesTotal = lines.reduce((s, l) => s + lineIncome(l), 0);
  const adjust = Number(adjustment) || 0;
  const grandTotal = linesTotal + adjust;

  // Split the lines by how they were paid. The over/short adjustment applies to
  // cash only (online payments are always exact).
  const cashLines = lines.reduce(
    (s, l) => s + ((l.paymentMethod || "Cash") === "Cash" ? lineIncome(l) : 0),
    0
  );
  const onlineLines = linesTotal - cashLines;
  const cashAfterAdjust = cashLines + adjust;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    // Per-line validation.
    for (let i = 0; i < lines.length; i++) {
      const msg = validateLine(lines[i]);
      if (msg) return setError(`Entry ${i + 1} — ${msg}`);
    }
    // Aggregate device quantities per product so the batch can't oversell.
    const need = {};
    for (const l of lines) {
      if (srcOf(l.sourceKey).mode !== "device") continue;
      for (const it of l.items || []) {
        if (it.productId)
          need[it.productId] = (need[it.productId] || 0) + (Number(it.qty) || 0);
      }
    }
    for (const pid in need) {
      const p = products.find((x) => x.id === pid);
      if (need[pid] > (p?.stock ?? 0))
        return setError(
          `Not enough stock for ${p?.name}: this batch needs ${need[pid]}, only ${p?.stock ?? 0} available.`
        );
    }

    setSaving(true);
    try {
      for (const l of lines) await saveLine(l, date, products);
      // Overall extra (+) / short (−) adjustment — this is a CASH discrepancy
      // (online payments are exact), so it's recorded against cash.
      if (adjust !== 0) {
        const label = adjust > 0 ? "Cash extra" : "Cash shortage";
        await addEntry("income", {
          amount: adjust,
          category: "Adjustment",
          note: adjustNote ? `${label} — ${adjustNote}` : label,
          date,
          paymentMethod: "Cash",
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
    <Modal open={open} onClose={onClose} title="Add Income" size="md">
      <form onSubmit={handleSave} className="space-y-3">
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Date (applies to all entries)"
          type="date"
          size="small"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          inputProps={{ max: todayStr() }}
          InputLabelProps={{ shrink: true }}
          sx={{ maxWidth: 280 }}
          fullWidth
        />

        <div className="space-y-3">
          {lines.map((line, i) => (
            <IncomeLine
              key={line._id}
              line={line}
              index={i}
              products={products}
              canRemove={lines.length > 1}
              onChange={(patch) => updateLine(line._id, patch)}
              onRemove={() => removeLine(line._id)}
            />
          ))}
        </div>

        <MuiButton size="small" startIcon={<AddIcon />} onClick={addLine}>
          Add another entry
        </MuiButton>

        {/* Cash over/short — online payments are exact, so this is cash only. */}
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 p-3 sm:grid-cols-2">
          <TextField
            label="Cash extra (+) / short (−)"
            type="number"
            size="small"
            value={adjustment}
            onChange={(e) => setAdjustment(e.target.value)}
            placeholder="e.g. 50 extra, -20 short"
            inputProps={{ step: "any" }}
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            fullWidth
          />
          <TextField
            label="Reason (optional)"
            size="small"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="Why over / short?"
            fullWidth
          />
          <p className="text-xs text-gray-400 sm:col-span-2">
            Adjusts cash only — online payments are always exact.
          </p>
        </div>

        <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <div className="flex justify-between">
            <span>💵 Cash</span>
            <span>{formatCurrency(cashLines)}</span>
          </div>
          {adjust !== 0 && (
            <>
              <div className="flex justify-between text-green-700">
                <span>{adjust > 0 ? "Cash extra (+)" : "Cash short (−)"}</span>
                <span>
                  {adjust > 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(adjust))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cash after adjustment</span>
                <span>{formatCurrency(cashAfterAdjust)}</span>
              </div>
            </>
          )}
          {onlineLines > 0 && (
            <div className="flex justify-between">
              <span>📱 Online</span>
              <span>{formatCurrency(onlineLines)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
            <span>Total income</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
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

// One income line inside the batch form. Adapts to its chosen source.
function IncomeLine({ line, index, products, canRemove, onChange, onRemove }) {
  const src = srcOf(line.sourceKey);
  const { mode } = src;
  const items = line.items || [];

  const changeSource = (key) => {
    const s = srcOf(key);
    onChange({
      sourceKey: key,
      amount: "",
      items: [{ productId: "", qty: "1", sellPrice: "" }],
      variant: s?.variants?.[0] || "",
      provider: INTERNET_PROVIDERS[0],
      newProvider: "",
    });
  };

  const setItems = (next) => onChange({ items: next });
  const updateItem = (i, patch) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems([...items, { productId: "", qty: "1", sellPrice: "" }]);
  const removeItem = (i) =>
    setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items);
  const pickProduct = (i, id) => {
    const p = products.find((x) => x.id === id);
    updateItem(i, {
      productId: id,
      sellPrice: p?.selling_price != null ? String(p.selling_price) : "",
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-3">
      <div className="flex items-start gap-2">
        <TextField
          select
          label={`Entry ${index + 1} — source`}
          size="small"
          value={line.sourceKey}
          onChange={(e) => changeSource(e.target.value)}
          fullWidth
        >
          {INCOME_SOURCES.map((s) => (
            <MenuItem key={s.key} value={s.key}>
              {s.icon} {s.label}
            </MenuItem>
          ))}
        </TextField>
        {canRemove && (
          <Tooltip title="Remove entry">
            <IconButton size="small" color="error" onClick={onRemove} sx={{ mt: 0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </div>

      {mode === "device" && (
        <>
          {src.variants && (
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              value={line.variant}
              onChange={(_e, v) => v && onChange({ variant: v })}
            >
              {src.variants.map((v) => (
                <ToggleButton key={v} value={v} sx={{ textTransform: "none" }}>
                  {v}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          <p className="text-xs text-gray-400">{src.hint}</p>
          {items.map((it, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2"
            >
              <ProductPicker
                products={products}
                value={it.productId}
                onChange={(id) => pickProduct(i, id)}
                sx={{ minWidth: 180, flex: 1 }}
              />
              <TextField
                label="Qty"
                type="number"
                size="small"
                value={it.qty}
                onChange={(e) => updateItem(i, { qty: e.target.value })}
                sx={{ width: 72 }}
                inputProps={{ min: 1, step: "any" }}
              />
              <TextField
                label="Price (0=free)"
                type="number"
                size="small"
                value={it.sellPrice}
                onChange={(e) => updateItem(i, { sellPrice: e.target.value })}
                sx={{ width: 120 }}
                inputProps={{ min: 0, step: "any" }}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                }}
              />
              {items.length > 1 && (
                <Tooltip title="Remove product">
                  <IconButton size="small" color="error" onClick={() => removeItem(i)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          ))}
          <MuiButton size="small" startIcon={<AddIcon />} onClick={addItem}>
            Add product
          </MuiButton>
          {src.charge && (
            <TextField
              label={src.chargeLabel || "Charge"}
              type="number"
              size="small"
              value={line.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
              placeholder="0"
              inputProps={{ min: 0, step: "any" }}
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
              fullWidth
            />
          )}
          <DeviceTotal
            items={items}
            charge={src.charge ? Number(line.amount) || 0 : 0}
          />
        </>
      )}

      {mode === "provider" && (
        <>
          <TextField
            select
            label="Provider"
            size="small"
            value={line.provider}
            onChange={(e) => onChange({ provider: e.target.value })}
            fullWidth
          >
            {INTERNET_PROVIDERS.map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
            <MenuItem value={ADD_NEW}>➕ Add new…</MenuItem>
          </TextField>
          {line.provider === ADD_NEW && (
            <TextField
              label="New provider name"
              size="small"
              value={line.newProvider}
              onChange={(e) => onChange({ newProvider: e.target.value })}
              fullWidth
            />
          )}
          <TextField
            label="Recharge amount"
            type="number"
            size="small"
            value={line.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="0"
            inputProps={{ min: 0, step: "any" }}
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            fullWidth
          />
        </>
      )}

      {mode === "simple" && (
        <TextField
          label="Amount"
          type="number"
          size="small"
          value={line.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder="0"
          inputProps={{ min: 0, step: "any" }}
          InputProps={{
            startAdornment: <InputAdornment position="start">₹</InputAdornment>,
          }}
          fullWidth
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <PaymentToggle
          value={line.paymentMethod || PAYMENT_METHODS[0]}
          onChange={(m) => onChange({ paymentMethod: m })}
        />
        <TextField
          label="Note (optional)"
          size="small"
          value={line.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Customer name, address, etc."
          sx={{ minWidth: 0, flex: 1 }}
        />
      </div>
    </div>
  );
}

function DeviceTotal({ items, charge }) {
  const products = (items || []).reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.sellPrice) || 0),
    0
  );
  const total = products + charge;
  return (
    <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
      <div className="flex justify-between">
        <span>Products</span>
        <span>{formatCurrency(products)}</span>
      </div>
      {charge > 0 && (
        <div className="flex justify-between">
          <span>Charge</span>
          <span>{formatCurrency(charge)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
        <span>Total income</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
