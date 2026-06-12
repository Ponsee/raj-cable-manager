// Export rows to an .xlsx workbook with one sheet per month (+ a Summary sheet).
import * as XLSX from "xlsx";

const ym = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) =>
  new Date(`${key}-01`).toLocaleString("en-IN", { month: "short", year: "numeric" });

// entries: raw rows (each must have created_at + amount).
// shape(entry) -> the object written to the sheet (column order = key order).
export function exportMonthlyExcel({ filename, entries, shape }) {
  const byMonth = {};
  for (const e of entries) (byMonth[ym(e.created_at)] ||= []).push(e);
  const keys = Object.keys(byMonth).sort();

  const wb = XLSX.utils.book_new();

  // Summary: per-month total + count.
  const summary = keys.map((k) => ({
    Month: monthLabel(k),
    Total: byMonth[k].reduce((s, e) => s + (Number(e.amount) || 0), 0),
    Entries: byMonth[k].length,
  }));
  summary.push({
    Month: "TOTAL",
    Total: entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    Entries: entries.length,
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

  for (const k of keys) {
    const data = byMonth[k]
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(shape);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), monthLabel(k));
  }

  if (!keys.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Note: "No data in the selected range" }]),
      "Empty"
    );
  }

  XLSX.writeFile(wb, filename);
}
