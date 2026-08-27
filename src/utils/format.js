// Small reusable helpers for displaying data consistently.

// Format a number as Indian Rupees. Whole amounts stay clean (15000 -> "₹15,000")
// and decimals are shown when present (6.5 -> "₹6.5", 6.55 -> "₹6.55").
export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// Format an ISO date string to a readable date, e.g. "22 May 2026"
export function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Turn 1 -> "1st", 2 -> "2nd", 5 -> "5th", etc.
export function ordinal(n) {
  const num = Number(n);
  if (!num) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Format a month string "2026-05" into "May 2026"
export function formatMonth(monthString) {
  if (!monthString) return "";
  const [year, month] = monthString.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
