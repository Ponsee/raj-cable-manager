import { useEffect, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { getPurchasePlan } from "../services/productsService";
import { formatCurrency } from "../utils/format";

// "What to buy this month" — analyses stock, recent usage, low-stock, and last
// month's spend to suggest a purchase budget that shrinks as you buy.
export default function PurchasePlan() {
  const [months, setMonths] = useState(1); // buffer to keep on hand
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlyToBuy, setOnlyToBuy] = useState(true);

  const load = async (m) => {
    setLoading(true);
    try {
      setData(await getPurchasePlan({ usageDays: 60, bufferDays: m * 30 }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(months);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  if (loading || !data)
    return <p className="text-gray-400">Analysing stock & usage…</p>;

  const { rows, totals } = data;
  const shown = onlyToBuy ? rows.filter((r) => r.suggestedQty > 0) : rows;

  return (
    <div>
      <PageHeader
        title="Purchase Plan"
        subtitle="Suggested buying for this month, based on stock & usage"
      />

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Keep stock for</span>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-2 py-1"
          >
            <option value={1}>1 month</option>
            <option value={2}>2 months</option>
            <option value={3}>3 months</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyToBuy}
            onChange={(e) => setOnlyToBuy(e.target.checked)}
          />
          <span className="text-gray-600">Only show items to buy</span>
        </label>
      </div>

      {/* Budget summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Suggested budget"
          value={formatCurrency(totals.suggestedTotal)}
          icon="🧮"
          accent="indigo"
        />
        <StatCard
          label="Bought this month"
          value={formatCurrency(totals.boughtThisMonth)}
          icon="🛒"
          accent="green"
        />
        <StatCard
          label="Remaining to buy"
          value={formatCurrency(totals.remaining)}
          icon="💰"
          accent="amber"
        />
        <StatCard
          label="Last month spent"
          value={formatCurrency(totals.lastMonthSpend)}
          icon="📆"
          accent="purple"
        />
      </div>

      {/* Plan table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {shown.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            Nothing to buy — stock looks healthy for the selected buffer. ✅
          </p>
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3 text-right">~Monthly use</th>
                  <th className="px-3 py-3 text-right">By usage</th>
                  <th className="px-3 py-3 text-right">Low top-up</th>
                  <th className="px-3 py-3 text-right">Suggested</th>
                  <th className="px-3 py-3 text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-900">{r.name}</span>
                      {r.code && (
                        <span className="ml-2 font-mono text-xs text-gray-400">
                          {r.code}
                        </span>
                      )}
                      {r.low && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                          Low
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {r.stock} {r.unit}
                      {r.min > 0 && (
                        <span className="text-xs text-gray-400"> /min {r.min}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {r.monthlyUse}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {r.usageSuggested || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {r.lowTopUp || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                      {r.suggestedQty || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                      {r.suggestedQty ? formatCurrency(r.estCost) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        "Suggested" is the larger of the usage-based amount (to cover {months}{" "}
        month{months > 1 ? "s" : ""} of sales/usage) and the low-stock top-up.
        Estimated cost uses each product's last purchase price. The remaining
        budget drops as you record purchases this month.
      </p>
    </div>
  );
}
