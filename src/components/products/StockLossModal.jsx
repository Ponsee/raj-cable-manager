// "Report Loss / Damage" popup — reduces a product's stock with a reason and
// creates NO income. Reused by the Income page (pick any product) and the
// Product Details page (product fixed).
//
// Props:
//   open, onClose, onSaved
//   products  - list to choose from (Income page)         } provide one
//   product   - a single fixed product (Product Details)  } of these
import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import ProductPicker from "./ProductPicker";
import { recordStockLoss } from "../../services/productsService";
import { LOSS_REASONS } from "../../constants";

const todayStr = () => new Date().toISOString().split("T")[0];

export default function StockLossModal({
  open,
  onClose,
  onSaved,
  products,
  product,
}) {
  const fixed = !!product;
  const list = fixed ? [product] : products || [];

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState(LOSS_REASONS[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setProductId(fixed ? product.id : "");
      setQty("1");
      setReason(LOSS_REASONS[0]);
      setNote("");
      setDate(todayStr());
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = list.find((p) => p.id === productId);
  const available = chosen?.stock ?? null;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!productId) return setError("Pick a product.");
    const q = Number(qty);
    if (!(q > 0)) return setError("Quantity must be at least 1.");
    if (available != null && q > available)
      return setError(`Only ${available} in stock — can't write off ${q}.`);

    setSaving(true);
    try {
      await recordStockLoss({
        productId,
        productName: chosen?.name,
        quantity: q,
        reason,
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
    <Modal open={open} onClose={onClose} title="Report Loss / Damage">
      <form onSubmit={handleSave}>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info">
            This reduces stock and records the reason. It does <b>not</b> create
            any income or expense.
          </Alert>

          {fixed ? (
            <TextField
              label="Product"
              value={product.name}
              disabled
              fullWidth
              size="small"
            />
          ) : (
            <ProductPicker
              products={list}
              value={productId}
              onChange={setProductId}
            />
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Quantity"
              type="number"
              inputProps={{ min: 1, step: "any" }}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              fullWidth
              size="small"
              helperText={available != null ? `${available} in stock` : " "}
            />
            <TextField
              select
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
            >
              {LOSS_REASONS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

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
            placeholder="e.g. dropped during install, customer returned faulty unit"
            fullWidth
            size="small"
          />

          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={saving}>
              {saving ? "Saving..." : "Report Loss"}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Modal>
  );
}
