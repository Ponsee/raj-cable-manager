import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import {
  getProduct,
  getStockTransactions,
  addStockTransaction,
} from "../../services/productsService";
import { calcStock } from "../../utils/productCalc";
import { STOCK_TYPES } from "../../constants";
import { formatCurrency } from "../../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Scan a product QR with the camera, then record a quick Sale (stock out + income).
export default function ScanToSellModal({ open, onClose, onSold }) {
  const [step, setStep] = useState("scan"); // "scan" | "sell"
  const [product, setProduct] = useState(null);
  const [stock, setStock] = useState(0);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const scannerRef = useRef(null);

  // Reset when the modal is closed.
  useEffect(() => {
    if (!open) {
      setStep("scan");
      setProduct(null);
      setQty("");
      setPrice("");
      setError("");
    }
  }, [open]);

  // Start/stop the camera scanner while on the "scan" step.
  useEffect(() => {
    if (!open || step !== "scan") return;
    let cancelled = false;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        async (decoded) => {
          if (cancelled) return;
          cancelled = true;
          try {
            await scanner.stop();
          } catch {
            // ignore
          }
          await handleFound(decoded);
        },
        () => {} // ignore per-frame decode errors
      )
      .catch((e) => setError("Cannot open camera: " + (e?.message || e)));

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const handleFound = async (id) => {
    setError("");
    try {
      const [p, txs] = await Promise.all([
        getProduct(id),
        getStockTransactions(id),
      ]);
      setProduct(p);
      setStock(calcStock(txs).stock);
      if (p.selling_price) setPrice(String(p.selling_price));
      setStep("sell");
    } catch {
      setError("No product found for this code. Try again.");
      setStep("scan");
    }
  };

  const total = (Number(qty) || 0) * (Number(price) || 0);

  const handleSell = async (e) => {
    e.preventDefault();
    setError("");
    const q = Number(qty) || 0;
    const rate = Number(price) || 0;
    if (q <= 0) return setError("Quantity must be greater than 0.");
    if (rate <= 0) return setError("Price must be greater than 0.");
    if (q > stock)
      return setError(`Not enough stock. Only ${stock} ${product.unit} available.`);

    setSaving(true);
    try {
      await addStockTransaction(
        {
          product_id: product.id,
          type: STOCK_TYPES.SALE,
          quantity: q,
          price_per_unit: rate,
          total_amount: total,
          vendor_name: null,
          note: "Sold via scan",
        },
        { productName: product.name }
      );
      await onSold?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Scan to Sell">
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === "scan" ? (
        <div>
          <p className="mb-3 text-sm text-gray-600">
            Point the camera at the product's QR label.
          </p>
          <div
            id="qr-reader"
            className="overflow-hidden rounded-lg border border-gray-200"
          />
          <p className="mt-3 text-center text-xs text-gray-400">
            Camera needs permission. Works on HTTPS or localhost.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSell} className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <p className="font-semibold text-gray-900">{product.name}</p>
            <p className="text-gray-500">
              In stock: {stock} {product.unit}
            </p>
          </div>

          <Field label={`Quantity (${product.unit})`}>
            <input
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputClass}
              placeholder="e.g. 1"
              autoFocus
            />
          </Field>

          <Field label="Selling price per unit (₹)">
            <input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>

          <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            Total sale: <strong>{formatCurrency(total)}</strong>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setStep("scan")}>
              Scan again
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Record Sale"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}
