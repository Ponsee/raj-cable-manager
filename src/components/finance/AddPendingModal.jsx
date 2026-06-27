// "Add Pending Payment" — a credit sale where the customer pays part now and
// owes the rest. Records the paid part as income, drops stock (if a product is
// picked), and stores the balance. Shared by the Pending page and the Income page.
import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import ProductPicker from "../products/ProductPicker";
import { addPending } from "../../services/pendingService";
import { formatCurrency } from "../../utils/format";
import { PAYMENT_METHODS } from "../../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const todayStr = () => new Date().toISOString().split("T")[0];

function PayToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            value === m
              ? "border-indigo-600 bg-indigo-50 text-indigo-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export default function AddPendingModal({ open, products, onClose, onSaved }) {
  const [customer, setCustomer] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCustomer("");
      setProductId("");
      setQuantity("1");
      setDescription("");
      setTotal("");
      setPaidNow("");
      setPaymentMethod(PAYMENT_METHODS[0]);
      setDate(todayStr());
      setError("");
    }
  }, [open]);

  const chosen = (products || []).find((p) => p.id === productId);
  const totalAmt = Number(total) || 0;
  const balance = Math.max(0, totalAmt - (Number(paidNow) || 0));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (totalAmt <= 0) return setError("Enter the total amount.");
    if ((Number(paidNow) || 0) > totalAmt)
      return setError("Paid now can't be more than the total.");
    if (productId && Number(quantity) > 0 && chosen && Number(quantity) > chosen.stock)
      return setError(`Only ${chosen.stock} ${chosen.unit || ""} in stock.`);
    if (!description.trim() && !productId)
      return setError("Enter what the payment is for (or pick a product).");

    setSaving(true);
    try {
      await addPending({
        customerName: customer,
        productId: productId || null,
        productName: chosen?.name,
        quantity: productId ? Number(quantity) || 0 : 0,
        description,
        total: totalAmt,
        paidNow: Number(paidNow) || 0,
        paymentMethod,
        date,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Pending Payment" size="md">
      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Customer name</label>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className={inputClass}
            placeholder="e.g. Ramesh"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Product (optional — reduces stock)
          </label>
          <ProductPicker products={products || []} value={productId} onChange={setProductId} />
        </div>

        {productId && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Quantity</label>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
            {chosen && <p className="mt-1 text-xs text-gray-400">{chosen.stock} in stock</p>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            What is it for? {productId ? "(optional)" : ""}
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder="e.g. Set-top box"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Total (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={inputClass}
              placeholder="1100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Paid now (₹)</label>
            <input
              type="number"
              min="0"
              max={totalAmt || undefined}
              step="any"
              value={paidNow}
              onChange={(e) => setPaidNow(e.target.value)}
              className={inputClass}
              placeholder="1000"
            />
          </div>
        </div>

        {Number(paidNow) > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Paid via</label>
            <PayToggle value={paymentMethod} onChange={setPaymentMethod} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass + " sm:max-w-xs"}
          />
        </div>

        <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <span>Balance due</span>
          <span>{formatCurrency(balance)}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
