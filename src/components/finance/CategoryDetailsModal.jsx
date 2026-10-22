import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import {
  getPurchaseDetails,
  getWorkerPayDetails,
} from "../../services/financeService";
import { formatCurrency, formatDate } from "../../utils/format";

const PURCHASE_CATEGORY = "Product purchase";
const WORKER_CATEGORIES = [
  "Staff salary",
  "Staff payment",
  "Worker advance",
  "Staff bonus",
  "Worker expense",
  "Contract work",
];

const sum = (rows, f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);

// Group rows by a key, biggest total first.
function groupBy(rows, keyOf, amountOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()]
    .map(([key, items]) => ({ key, items, total: sum(items, amountOf) }))
    .sort((a, b) => b.total - a.total);
}

// Details of one expense category for the selected range: what was bought (by
// vendor) for Product purchase, who was paid for worker categories, and the
// plain entries for everything else.
export default function CategoryDetailsModal({ open, onClose, category, entries }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Stable key so a parent re-render (new array, same rows) doesn't refetch.
  const idsKey = entries.map((e) => e.id).join(",");
  const isPurchase = category === PURCHASE_CATEGORY;
  const isWorker = WORKER_CATEGORIES.includes(category);

  useEffect(() => {
    if (!open || !(isPurchase || isWorker)) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    const ids = idsKey ? idsKey.split(",") : [];
    (isPurchase ? getPurchaseDetails(ids) : getWorkerPayDetails(ids))
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, category, idsKey, isPurchase, isWorker]);

  const total = sum(entries, (e) => e.amount);
  // What actually went out is the expense amount. A worker row's own amount can
  // be bigger (work value before the advance was adjusted), so totals must use this.
  const paidOf = new Map(entries.map((e) => [e.id, Number(e.amount) || 0]));
  const linked = new Set(rows.map((r) => r.expense_id));
  // Expense rows with no itemised detail (older entries, or deleted links).
  const unlinked = entries.filter((e) => !linked.has(e.id));

  const entryList = (list) => (
    <ul className="divide-y divide-gray-100 text-sm">
      {list.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-gray-800">{e.note || "—"}</p>
            <p className="text-xs text-gray-400">
              {formatDate(e.created_at)}
              {e.payment_method ? ` · ${e.payment_method}` : ""}
            </p>
          </div>
          <span className="shrink-0 font-medium text-gray-900">
            {formatCurrency(e.amount)}
          </span>
        </li>
      ))}
    </ul>
  );

  const groupHeader = (name, count, amount) => (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <span className="font-semibold text-gray-800">
        {name}{" "}
        <span className="text-xs font-normal text-gray-400">
          ({count} {count === 1 ? "item" : "items"})
        </span>
      </span>
      <span className="font-semibold text-gray-900">{formatCurrency(amount)}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={`${category} — details`} size="lg">
      <div className="space-y-4">
        <div className="flex justify-between rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          <span>
            {entries.length} {entries.length === 1 ? "entry" : "entries"} (selected range)
          </span>
          <span>{formatCurrency(total)}</span>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading details...</p>}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Product purchase → by vendor, then each item */}
        {isPurchase &&
          !loading &&
          groupBy(rows, (r) => r.vendor_name || "No vendor", (r) => r.total_amount).map(
            (g) => {
              const extras = sum(g.items, (r) => r.transport) - sum(g.items, (r) => r.discount);
              return (
                <div key={g.key} className="space-y-1">
                  {groupHeader(g.key, g.items.length, g.total + extras)}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-gray-400">
                        <tr>
                          <th className="px-2 py-1">Date</th>
                          <th className="px-2 py-1">Product</th>
                          <th className="px-2 py-1 text-right">Qty</th>
                          <th className="px-2 py-1 text-right">Rate</th>
                          <th className="px-2 py-1 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {g.items.map((r) => (
                          <tr key={r.id}>
                            <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">
                              {formatDate(r.created_at)}
                            </td>
                            <td className="px-2 py-1.5 text-gray-800">
                              {r.products?.name || "—"}
                              {r.products?.subcategory && (
                                <span className="ml-1 text-xs text-gray-400">
                                  {r.products.subcategory}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">{Number(r.quantity)}</td>
                            <td className="px-2 py-1.5 text-right">
                              {formatCurrency(r.price_per_unit)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium">
                              {formatCurrency(r.total_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {extras !== 0 && (
                    <p className="px-2 text-xs text-gray-500">
                      {sum(g.items, (r) => r.transport) > 0 &&
                        `Transport +${formatCurrency(sum(g.items, (r) => r.transport))} `}
                      {sum(g.items, (r) => r.discount) > 0 &&
                        `Discount −${formatCurrency(sum(g.items, (r) => r.discount))}`}
                    </p>
                  )}
                </div>
              );
            }
          )}

        {/* Worker categories → by worker */}
        {isWorker &&
          !loading &&
          groupBy(rows, (r) => r.workers?.name || "Unknown", (r) => paidOf.get(r.expense_id)).map((g) => (
            <div key={g.key} className="space-y-1">
              {groupHeader(g.key, g.items.length, g.total)}
              <ul className="divide-y divide-gray-100 text-sm">
                {g.items.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 px-2 py-1.5">
                    <span className="text-gray-600">
                      {formatDate(r.created_at)} · <span className="capitalize">{r.type}</span>
                      {r.note ? ` · ${r.note}` : ""}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-medium">
                        {formatCurrency(paidOf.get(r.expense_id))}
                      </span>
                      {Math.round(Number(r.amount)) !==
                        Math.round(paidOf.get(r.expense_id)) && (
                        <span className="block text-xs text-gray-400">
                          work value {formatCurrency(r.amount)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {/* Everything else, and any rows without itemised detail */}
        {!loading && (!(isPurchase || isWorker) ? entries : unlinked).length > 0 && (
          <div>
            {(isPurchase || isWorker) && (
              <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                Other entries (no item details)
              </p>
            )}
            {entryList(!(isPurchase || isWorker) ? entries : unlinked)}
          </div>
        )}
      </div>
    </Modal>
  );
}
