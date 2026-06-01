import { Link, useLocation } from "react-router-dom";

// Friendly labels for each URL segment. Unknown segments (like an id on a
// details page) fall back to "Details".
const LABELS = {
  dashboard: "Dashboard",
  workers: "Workers",
  products: "Products",
  vendors: "Vendors",
  "purchase-plan": "Buy Plan",
  income: "Income",
  expense: "Expense",
  reports: "Reports",
  users: "Users",
  settings: "Settings",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  // Build a crumb per segment with its cumulative link path.
  const crumbs = segments.map((seg, i) => ({
    label: LABELS[seg] || "Details",
    to: "/" + segments.slice(0, i + 1).join("/"),
  }));

  // Always start from the dashboard as "home".
  const home = { label: "Home", to: "/dashboard" };
  const isHome = pathname === "/dashboard";
  const trail = isHome ? [home] : [home, ...crumbs];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 truncate text-sm">
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={crumb.to} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">/</span>}
              {isLast ? (
                <span className="font-semibold text-gray-800">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  className="text-gray-500 transition hover:text-indigo-600"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
