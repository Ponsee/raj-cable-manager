import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import { getSaleDetails } from "../../services/financeService";
import { formatCurrency, formatDate } from "../../utils/format";

const sum = (rows, f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);

// Details of one income source for the selected range. Product sales are
// grouped by product (qty sold); other rows (recharges, charges, collections)
// are grouped by their note's first part (e.g. the provider). Every row shows
// the income amount, so the totals always match the "By source" figure.
export default function SourceDetailsModal({ open, onClose, source, entries }) {
  const [sales, setSales] = useState({}); // stock_tx_id -> stock row
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stockKey = entries.map((e) => e.stock_tx_id).filter(Boolean).join(",");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    if (!stockKey) {
      setSales({});
      return;
    }
    setLoading(true);
    getSaleDetails(stockKey.split(","))
      .then((rows) => !cancelled && setSales(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, stockKey]);

  const groupName = (e) => {
    const tx = e.stock_tx_id && sales[e.stock_tx_id];
    if (tx?.products?.name) return tx.products.name;
    return (e.note || "").split(" — ")[0].trim() || "No note";
  };

  const map = new Map();
  for (const e of entries) {
    const k = groupName(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  const groups = [...map.entries()]
    .map(([name, items]) => ({ name, items, total: sum(items, (e) => e.amount) }))
    .sort((a, b) => b.total - a.total);

  const total = sum(entries, (e) => e.amount);

  return (
    <Modal open={open} onClose={onClose} title={`${source} — details`} size="lg">
      <div className="space-y-4">
        <div className="flex justify-between rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
          <span>
            {entries.length} {entries.length === 1 ? "entry" : "entries"} (selected range)
          </span>
          <span>{formatCurrency(total)}</span>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading details...</p>}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {!loading &&
          groups.map((g) => (
            <div key={g.name} className="space-y-1">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="font-semibold text-gray-800">
                  {g.name}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    ({g.items.length} {g.items.length === 1 ? "entry" : "entries"}
                    {(() => {
                      const qty = sum(g.items, (e) => sales[e.stock_tx_id]?.quantity);
                      return qty > 0 ? ` · ${qty} sold` : "";
                    })()}
                    )
                  </span>
                </span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(g.total)}
                </span>
              </div>
              <ul className="divide-y divide-gray-100 text-sm">
                {g.items.map((e) => {
                  const tx = e.stock_tx_id && sales[e.stock_tx_id];
                  return (
                    <li key={e.id} className="flex justify-between gap-3 px-2 py-1.5">
                      <span className="min-w-0 text-gray-600">
                        {formatDate(e.created_at)}
                        {tx
                          ? ` · ${Number(tx.quantity)} × ${formatCurrency(tx.price_per_unit)}`
                          : ""}
                        {e.note && !tx ? ` · ${e.note}` : ""}
                        {e.payment_method ? ` · ${e.payment_method}` : ""}
                      </span>
                      <span className="shrink-0 font-medium">
                        {formatCurrency(e.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>
    </Modal>
  );
}
