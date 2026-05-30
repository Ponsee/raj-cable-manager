import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { formatCurrency } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants";

// Placeholder values for now. Real numbers get wired in once Workers /
// Products / Income / Expense modules exist (Module 5 in the plan).
export default function Dashboard() {
  const { user, role } = useAuth();
  const name = user?.email?.split("@")[0] || "there";
  const isAdmin = role === ROLES.ADMIN;

  const tiles = [
    { label: "Total Income", value: 0, icon: "💰", accent: "green" },
    { label: "Total Expense", value: 0, icon: "💸", accent: "red" },
    { label: "Profit", value: 0, icon: "📈", accent: "blue" },
    // Worker pay is admin-only.
    { label: "Pending Salary", value: 0, icon: "👷", accent: "amber", adminOnly: true },
  ].filter((tile) => !tile.adminOnly || isAdmin);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${name} 👋`}
        subtitle="Here's your business summary for this month"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatCard
            key={tile.label}
            label={tile.label}
            value={formatCurrency(tile.value)}
            icon={tile.icon}
            accent={tile.accent}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-800">
            Income vs Expense
          </h3>
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
            Chart appears once you add income &amp; expenses
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-800">Recent Activity</h3>
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
            Latest payments &amp; entries will show here
          </div>
        </div>
      </div>
    </div>
  );
}
