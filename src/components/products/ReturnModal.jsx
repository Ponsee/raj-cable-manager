// "Return" popup — a customer brings an item back. Adds it to stock and, if you
// refunded them, records the money out (Cash/Online). Reused by the Income page
// (pick any product) and Product Details (product fixed) — like StockLossModal.
//
// Props: open, onClose, onSaved, products (Income) OR product (Product Details)
import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import ProductPicker from "./ProductPicker";
import { recordReturn } from "../../services/productsService";
import { PAYMENT_METHODS } from "../../constants";

const todayStr = () => new Date().toISOString().split("T")[0];

export default function ReturnModal({ open, onClose, onSaved, products, product }) {
  const fixed = !!product;
  const list = fixed ? [product] : products || [];

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [refund, setRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setProductId(fixed ? product.id : "");
      setQty("1");
      setRefund(false);
      setRefundAmount("");
      setPaymentMethod(PAYMENT_METHODS[0]);
      setNote("");
      setDate(todayStr());
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = list.find((p) => p.id === productId);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!productId) return setError("Pick a product.");
    const q = Number(qty);
    if (!(q > 0)) return setError("Quantity must be at least 1.");
    if (refund && !(Number(refundAmount) > 0))
      return setError("Enter the refund amount, or turn refund off.");

    setSaving(true);
    try {
      await recordReturn({
        productId,
        productName: chosen?.name,
        quantity: q,
        refund,
        refundAmount,
        paymentMethod,
        note,
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
    <Modal open={open} onClose={onClose} title="Return">
      <form onSubmit={handleSave}>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            Adds the item <b>back to stock</b>. Turn on “Refund money” if you paid
            the customer back.
          </Alert>

          {fixed ? (
            <TextField label="Product" value={product.name} disabled fullWidth size="small" />
          ) : (
            <ProductPicker products={list} value={productId} onChange={setProductId} />
          )}

          <TextField
            label="Quantity returned"
            type="number"
            inputProps={{ min: 1, step: "any" }}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            fullWidth
            size="small"
          />

          {/* Refund money? */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Refund money?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, label: "No (just take it back)" },
                { v: true, label: "Yes (give money back)" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setRefund(o.v)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    refund === o.v
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {refund && (
            <>
              <TextField
                label="Refund amount (₹)"
                type="number"
                inputProps={{ min: 0, step: "any" }}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                fullWidth
                size="small"
              />
              <div>
                <label className="mb-1 block text-xs text-gray-500">Refund via</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        paymentMethod === m
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            inputProps={{ max: todayStr() }}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />

          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. faulty remote, wrong model, customer name"
            fullWidth
            size="small"
          />

          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? "Saving..." : "Save Return"}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Modal>
  );
}
