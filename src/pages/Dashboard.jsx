import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { PieChart } from "@mui/x-charts/PieChart";
import { BarChart } from "@mui/x-charts/BarChart";
import IncomeExpenseChart from "../components/finance/IncomeExpenseChart";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import StatCard from "../components/ui/StatCard";
import DateRangePicker, {
  inRange,
  currentMonthRange,
} from "../components/ui/DateRangePicker";
import { getEntries } from "../services/financeService";
import { getProductsWithStock, getSales } from "../services/productsService";
import { getWorkersWithBalance } from "../services/workersService";
import { getPendingCount } from "../services/usersService";
import { isLowStock } from "../utils/productCalc";
import { formatCurrency, formatDate } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants";

const dayKey = (ts) => new Date(ts).toISOString().split("T")[0];
const sum = (arr) => arr.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const payOf = (e) => ((e.payment_method || "Cash") === "Cash" ? "Cash" : "Online");
// The cash part of a row — handles Split rows (cash_amount), else all-or-nothing.
const cashOf = (e) => {
  const m = e.payment_method || "Cash";
  if (m === "Split") return Number(e.cash_amount) || 0;
  return m === "Cash" ? Number(e.amount) || 0 : 0;
};

// Group rows by a key field → [{ key, amount }] sorted desc.
function breakdown(rows, keyName) {
  const map = {};
  for (const r of rows) {
    const k = r[keyName] || "Other";
    map[k] = (map[k] || 0) + (Number(r.amount) || 0);
  }
  return Object.entries(map)
    .map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// Group rows by category, splitting each into cash / online (Split-aware).
// → [{ key, cash, online }] sorted by total desc.
function payBreakdown(rows) {
  const map = {};
  for (const r of rows) {
    const k = r.category || "Other";
    if (!map[k]) map[k] = { key: k, cash: 0, online: 0 };
    const c = cashOf(r);
    map[k].cash += c;
    map[k].online += (Number(r.amount) || 0) - c;
  }
  return Object.values(map).sort(
    (a, b) => b.cash + b.online - (a.cash + a.online)
  );
}

// Keep the top `max` categories; fold the rest into a single "Other" row.
function topWithOther(rows, max = 7) {
  const top = rows.slice(0, max);
  const rest = rows.slice(max);
  if (rest.length) {
    top.push(
      rest.reduce((a, r) => ({ key: "Other", cash: a.cash + r.cash, online: a.online + r.online }), {
        cash: 0,
        online: 0,
      })
    );
  }
  return top;
}

export default function Dashboard() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === ROLES.ADMIN;
  const name = profile?.name || user?.email?.split("@")[0] || "there";

  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(currentMonthRange());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [inc, exp, prods, sls] = await Promise.all([
          getEntries("income"),
          getEntries("expenses"),
          getProductsWithStock(),
          getSales().catch(() => []),
        ]);
        setIncome(inc);
        setExpenses(exp);
        setProducts(prods);
        setSales(sls);
        if (isAdmin) {
          getWorkersWithBalance().then(setWorkers).catch(() => {});
          getPendingCount().then(setPending).catch(() => {});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  if (loading) return <p className="text-gray-400">Loading dashboard…</p>;

  const today = dayKey(new Date().toISOString());
  const inInc = income.filter((e) => inRange(e.created_at, range.start, range.end));
  const inExp = expenses.filter((e) => inRange(e.created_at, range.start, range.end));

  const todayIncome = sum(income.filter((e) => dayKey(e.created_at) === today));
  const totalIncome = sum(inInc);
  const totalExpense = sum(inExp);
  const net = totalIncome - totalExpense;
  const cash = sum(inInc.filter((e) => payOf(e) === "Cash"));
  const online = totalIncome - cash;
  // Expense split into cash / online (Split rows counted by their breakdown).
  const expCash = inExp.reduce((s, e) => s + cashOf(e), 0);
  const expOnline = totalExpense - expCash;

  const incomeBySource = breakdown(inInc, "category");
  const expenseByCategory = breakdown(inExp, "category");

  // Best selling products in the range (by units sold).
  const bestMap = {};
  for (const s of sales) {
    if (!inRange(s.created_at, range.start, range.end)) continue;
    const m = (bestMap[s.product_id] ||= {
      product_id: s.product_id,
      name: s.name,
      qty: 0,
      revenue: 0,
    });
    m.qty += s.quantity;
    m.revenue += s.amount;
  }
  const bestSellers = Object.values(bestMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // Per-category cash vs online (for the stacked charts).
  const incPayByCat = topWithOther(payBreakdown(inInc));
  const expPayByCat = topWithOther(payBreakdown(inExp));

  const lowStock = products.filter((p) => isLowStock(p.stock, p.minimum_stock));
  const stockValue = products.reduce((s, p) => s + (Number(p.stockValue) || 0), 0);
  const balanceDue = workers.reduce((s, w) => s + (Number(w.balance) || 0), 0);

  const recent = [
    ...income.map((e) => ({ ...e, kind: "income" })),
    ...expenses.map((e) => ({ ...e, kind: "expense" })),
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  // Last 6 months income vs expense (ignores the range — a longer-term view).
  const ym = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const now = new Date();
  const monthCols = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthCols.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
    });
  }
  const mAgg = {};
  monthCols.forEach((m) => (mAgg[m.key] = { income: 0, expense: 0 }));
  for (const e of income)
    if (mAgg[ym(e.created_at)]) mAgg[ym(e.created_at)].income += Number(e.amount) || 0;
  for (const e of expenses)
    if (mAgg[ym(e.created_at)]) mAgg[ym(e.created_at)].expense += Number(e.amount) || 0;

  // ---- Selected-range views (follow the header date picker) ----
  // Products sold in the range (by units), top 8.
  const pmSalesMap = {};
  for (const s of sales) {
    if (!inRange(s.created_at, range.start, range.end)) continue;
    const m = (pmSalesMap[s.product_id] ||= {
      product_id: s.product_id,
      name: s.name,
      qty: 0,
      revenue: 0,
    });
    m.qty += s.quantity;
    m.revenue += s.amount;
  }
  const pmTopProducts = Object.values(pmSalesMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  // Income in the range grouped by source: amount + how many entries.
  const pmIncBySource = (() => {
    const map = {};
    for (const r of inInc) {
      const k = r.category || "Other";
      if (!map[k]) map[k] = { key: k, amount: 0, count: 0 };
      map[k].amount += Number(r.amount) || 0;
      map[k].count += 1;
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  })();
  const pmIncTotal = pmIncBySource.reduce((s, r) => s + r.amount, 0);

  // Pie data: top categories + an "Other" slice for the rest.
  const pieData = (rows, max = 6) => {
    const data = rows.slice(0, max).map((r, i) => ({ id: i, value: r.amount, label: r.key }));
    const rest = rows.slice(max).reduce((s, r) => s + r.amount, 0);
    if (rest > 0) data.push({ id: max, value: rest, label: "Other" });
    return data;
  };

  // Excel export — one sheet per month, plus a Summary sheet.
  const monthLabel = (key) =>
    new Date(`${key}-01`).toLocaleString("en-IN", { month: "short", year: "numeric" });

  const exportExcel = () => {
    // All income + expense in the selected range, tagged by type.
    const all = [
      ...inInc.map((e) => ({ ...e, _type: "Income" })),
      ...inExp.map((e) => ({ ...e, _type: "Expense" })),
    ];
    const byMonth = {};
    for (const e of all) (byMonth[ym(e.created_at)] ||= []).push(e);
    const monthKeys = Object.keys(byMonth).sort();

    const wb = XLSX.utils.book_new();

    // Summary sheet: per-month income / expense / net.
    const summary = monthKeys.map((k) => {
      const rows = byMonth[k];
      const inc = rows.filter((r) => r._type === "Income").reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const exp = rows.filter((r) => r._type === "Expense").reduce((s, r) => s + (Number(r.amount) || 0), 0);
      return { Month: monthLabel(k), Income: inc, Expense: exp, "Net profit": inc - exp };
    });
    summary.push({
      Month: "TOTAL",
      Income: totalIncome,
      Expense: totalExpense,
      "Net profit": net,
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

    // One sheet per month with every transaction.
    for (const k of monthKeys) {
      const rows = byMonth[k]
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((e) => ({
          Date: formatDate(e.created_at),
          Type: e._type,
          "Category / Source": e.category || "",
          Payment: e._type === "Income" ? e.payment_method || "Cash" : "",
          Note: e.note || "",
          Amount: Number(e.amount) || 0,
        }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, monthLabel(k)); // e.g. "Jun 2026"
    }

    if (monthKeys.length === 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ Note: "No data in the selected range" }]),
        "Empty"
      );
    }

    XLSX.writeFile(wb, `report-${today}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${name} 👋`}
        subtitle="Business summary & reports"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
            <Button variant="secondary" onClick={exportExcel}>
              ⬇️ Export Excel
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Today's income" value={formatCurrency(todayIncome)} icon="📅" accent="green"
          onClick={() => navigate("/income")} />
        <StatCard label="Income (range)" value={formatCurrency(totalIncome)} icon="💰" accent="indigo"
          onClick={() => navigate("/income")} />
        <StatCard label="Expense (range)" value={formatCurrency(totalExpense)} icon="💸" accent="red"
          onClick={() => navigate("/expense")} />
        <StatCard label="Net profit" value={formatCurrency(net)} icon={net >= 0 ? "📈" : "📉"}
          accent={net >= 0 ? "blue" : "red"} />
        <StatCard label="Cash" value={formatCurrency(cash)} icon="💵" accent="amber" />
        <StatCard label="Online" value={formatCurrency(online)} icon="📱" accent="purple" />
        <StatCard label="Low-stock items" value={lowStock.length} icon="⚠️"
          accent={lowStock.length > 0 ? "red" : "green"} onClick={() => navigate("/products")} />
        <StatCard label="Stock value" value={formatCurrency(stockValue)} icon="🏷️" accent="blue" />
        {isAdmin && (
          <StatCard label="Worker balance due" value={formatCurrency(balanceDue)} icon="👷"
            accent="orange" onClick={() => navigate("/workers")} />
        )}
        {isAdmin && pending > 0 && (
          <StatCard label="Pending approvals" value={pending} icon="🔔" accent="amber"
            onClick={() => navigate("/users")} />
        )}
      </div>

      {/* Daily trend */}
      <div className="mb-6">
        <ChartCard title="Income vs Expense" subtitle="Per day, selected range">
          <IncomeExpenseChart income={income} expenses={expenses} start={range.start} end={range.end} />
        </ChartCard>
      </div>

      {/* Row 2: income source + expense category pies */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Income by source" subtitle="Share of income (range)">
          {incomeBySource.length === 0 ? (
            <Empty />
          ) : (
            <PieChart height={260} series={[{ data: pieData(incomeBySource), innerRadius: 45, paddingAngle: 1 }]} />
          )}
        </ChartCard>
        <ChartCard title="Expense by category" subtitle="Where money goes (range)">
          {expenseByCategory.length === 0 ? (
            <Empty />
          ) : (
            <PieChart height={260} series={[{ data: pieData(expenseByCategory), innerRadius: 45, paddingAngle: 1 }]} />
          )}
        </ChartCard>
      </div>

      {/* Cash vs Online */}
      <div className="mb-6">
        <ChartCard
          title="Cash vs Online"
          subtitle="Income & expense by payment method (range)"
        >
          {totalIncome === 0 && totalExpense === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <BarChart
                height={280}
                xAxis={[{ scaleType: "band", data: ["Cash", "Online"] }]}
                series={[
                  { data: [cash, online], label: "Income", color: "#16a34a" },
                  {
                    data: [expCash, expOnline],
                    label: "Expense",
                    color: "#ef4444",
                  },
                ]}
              />
            </div>
          )}
        </ChartCard>
      </div>

      {/* Cash vs Online by category */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Income — Cash vs Online by source"
          subtitle="Each source split by payment (range)"
        >
          {incPayByCat.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <BarChart
                height={300}
                xAxis={[{ scaleType: "band", data: incPayByCat.map((r) => r.key) }]}
                series={[
                  { data: incPayByCat.map((r) => r.cash), label: "Cash", stack: "t", color: "#f59e0b" },
                  { data: incPayByCat.map((r) => r.online), label: "Online", stack: "t", color: "#8b5cf6" },
                ]}
              />
            </div>
          )}
        </ChartCard>
        <ChartCard
          title="Expense — Cash vs Online by category"
          subtitle="Each category split by payment (range)"
        >
          {expPayByCat.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <BarChart
                height={300}
                xAxis={[{ scaleType: "band", data: expPayByCat.map((r) => r.key) }]}
                series={[
                  { data: expPayByCat.map((r) => r.cash), label: "Cash", stack: "t", color: "#f59e0b" },
                  { data: expPayByCat.map((r) => r.online), label: "Online", stack: "t", color: "#8b5cf6" },
                ]}
              />
            </div>
          )}
        </ChartCard>
      </div>

      {/* Monthly trend */}
      <div className="mb-6">
        <ChartCard title="Last 6 months" subtitle="Income vs expense by month">
          <div className="overflow-x-auto">
            <BarChart
              height={280}
              xAxis={[{ scaleType: "band", data: monthCols.map((m) => m.label) }]}
              series={[
                { data: monthCols.map((m) => mAgg[m.key].income), label: "Income", color: "#16a34a" },
                { data: monthCols.map((m) => mAgg[m.key].expense), label: "Expense", color: "#ef4444" },
              ]}
            />
          </div>
        </ChartCard>
      </div>

      {/* Products sold + income by source (follow the date range) */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Products sold"
          subtitle="Units sold (selected range)"
        >
          {pmTopProducts.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <BarChart
                height={Math.max(220, pmTopProducts.length * 42)}
                layout="horizontal"
                margin={{ left: 130 }}
                yAxis={[{ scaleType: "band", data: pmTopProducts.map((p) => p.name) }]}
                series={[
                  {
                    data: pmTopProducts.map((p) => p.qty),
                    label: "Units sold",
                    color: "#6366f1",
                  },
                ]}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Income by source"
          subtitle="What makes up income (selected range)"
        >
          {pmIncBySource.length === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="overflow-x-auto">
                <BarChart
                  height={Math.max(200, pmIncBySource.length * 42)}
                  layout="horizontal"
                  margin={{ left: 130 }}
                  yAxis={[{ scaleType: "band", data: pmIncBySource.map((r) => r.key) }]}
                  series={[
                    {
                      data: pmIncBySource.map((r) => r.amount),
                      label: "Income",
                      color: "#16a34a",
                    },
                  ]}
                />
              </div>
              {/* How many of each + amount */}
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-sm">
                {pmIncBySource.map((r) => (
                  <div key={r.key} className="flex justify-between">
                    <span className="text-gray-700">
                      {r.key}{" "}
                      <span className="text-xs text-gray-400">({r.count}×)</span>
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(r.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{formatCurrency(pmIncTotal)}</span>
                </div>
              </div>
            </>
          )}
        </ChartCard>
      </div>

      {/* Best sellers + Recent activity */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-gray-800">
            🏆 Best selling products{" "}
            <span className="text-xs font-normal text-gray-400">(range)</span>
          </h3>
          {bestSellers.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-gray-400">
              No sales in this range.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {bestSellers.map((p, i) => (
                <div
                  key={p.product_id || i}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                      {i + 1}
                    </span>
                    <p className="truncate text-sm font-medium text-gray-800">
                      {p.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {p.qty} sold
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(p.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-semibold text-gray-800">Recent activity</h3>
        {recent.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-gray-400">
            No activity yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map((e) => (
              <div key={`${e.kind}-${e.id}`} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {e.category || (e.kind === "income" ? "Income" : "Expense")}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(e.created_at)}</p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    e.kind === "income" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {e.kind === "income" ? "+" : "−"}
                  {formatCurrency(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="mb-2 text-xs text-gray-400">{subtitle}</p>}
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-gray-400">
      No data in this range.
    </div>
  );
}
