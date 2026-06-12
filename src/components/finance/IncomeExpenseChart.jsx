// Shared "Income vs Expense" bar chart (per day) for a date range.
// Used on both the Dashboard and the Reports page.
import { BarChart } from "@mui/x-charts/BarChart";
import { inRange } from "../ui/DateRangePicker";
import { formatDate } from "../../utils/format";

const dayKey = (ts) => new Date(ts).toISOString().split("T")[0];

export default function IncomeExpenseChart({
  income = [],
  expenses = [],
  start,
  end,
  height = 280,
  emptyText = "No data in this range.",
}) {
  const byDay = {};
  for (const e of income) {
    if (!inRange(e.created_at, start, end)) continue;
    (byDay[dayKey(e.created_at)] ||= { income: 0, expense: 0 }).income +=
      Number(e.amount) || 0;
  }
  for (const e of expenses) {
    if (!inRange(e.created_at, start, end)) continue;
    (byDay[dayKey(e.created_at)] ||= { income: 0, expense: 0 }).expense +=
      Number(e.amount) || 0;
  }
  const days = Object.keys(byDay).sort();

  if (days.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <BarChart
        height={height}
        xAxis={[{ scaleType: "band", data: days.map((d) => formatDate(d)) }]}
        series={[
          { data: days.map((d) => byDay[d].income), label: "Income", color: "#16a34a" },
          { data: days.map((d) => byDay[d].expense), label: "Expense", color: "#ef4444" },
        ]}
      />
    </div>
  );
}
