// "ID Recharge" — money paid to the MSO / provider to recharge a subscriber ID
// (e.g. TCCL 041, TCCL 176, TIC). Books a normal expense under the "ID Recharge"
// category; the chosen ID and the month it's FOR are kept in the note so they
// show in the ledger and can be read back later. The month defaults to the
// current one but any past month can be picked (e.g. paying July's bill in Aug).
import { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { addEntry, getRechargeIds } from "../../services/financeService";
import { formatCurrency } from "../../utils/format";
import { ID_RECHARGE_CATEGORY, RECHARGE_IDS, PAYMENT_METHODS } from "../../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const todayStr = () => new Date().toISOString().split("T")[0];
const thisMonth = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
// "2026-07" -> "Jul 2026"
function monthLabel(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTHS[m - 1]} ${y}`;
}

// The default note text for a given ID + month. Kept as the first token before
// " · " so getRechargeIds() can read the ID back reliably.
const defaultNote = (id, month) =>
  id ? `${id} · for ${monthLabel(month)}` : "";

export default function IdRechargeModal({ open, onClose, onBack, onSaved }) {
  const [rechargeId, setRechargeId] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [note, setNote] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayStr());
  const [idOptions, setIdOptions] = useState(RECHARGE_IDS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setRechargeId("");
      setAmount("");
      setMonth(thisMonth());
      setNote("");
      setNoteTouched(false);
      setPaymentMethod(PAYMENT_METHODS[0]);
      setDate(todayStr());
      setError("");
      // Seed with the fixed list + any IDs used before, de-duplicated.
      getRechargeIds()
        .then((used) => setIdOptions([...new Set([...RECHARGE_IDS, ...used])]))
        .catch(() => setIdOptions(RECHARGE_IDS));
    }
  }, [open]);

  // Pre-fill the note from the ID + month, and keep it in sync until the user
  // edits it by hand (after that, their text stays untouched).
  useEffect(() => {
    if (!noteTouched) setNote(defaultNote(rechargeId.trim(), month));
  }, [rechargeId, month, noteTouched]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    const id = rechargeId.trim();
    if (!id) return setError("Pick or type an ID (e.g. TCCL 041).");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than 0.");

    // Save the note as shown. If the user rewrote it and dropped the ID prefix,
    // re-add it so the ID is still readable back by getRechargeIds().
    let fullNote = note.trim();
    if (!fullNote) fullNote = defaultNote(id, month);
    else if (!fullNote.startsWith(id)) fullNote = `${defaultNote(id, month)} — ${fullNote}`;

    setSaving(true);
    try {
      await addEntry("expenses", {
        amount,
        category: ID_RECHARGE_CATEGORY,
        note: fullNote,
        date,
        paymentMethod,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Expense › ID Recharge" size="md">
      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ID</label>
          <Autocomplete
            freeSolo
            options={idOptions}
            value={rechargeId}
            inputValue={rechargeId}
            onInputChange={(_e, val) => setRechargeId(val)}
            size="small"
            renderInput={(params) => (
              <TextField {...params} placeholder="e.g. TCCL 041" autoFocus />
            )}
          />
          <p className="mt-1 text-xs text-gray-400">
            Pick one or type a new ID — it'll be remembered next time.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Amount (₹)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
              placeholder="5000"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              For month
            </label>
            <input
              type="month"
              value={month}
              max={thisMonth()}
              onChange={(e) => setMonth(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              Which month's amount this comes out of.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Paid on
          </label>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass + " sm:max-w-xs"}
          />
          <p className="mt-1 text-xs text-gray-400">
            The actual date you paid — this is the date shown in the list.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Note (optional)
          </label>
          <input
            value={note}
            onChange={(e) => {
              setNoteTouched(true);
              setNote(e.target.value);
            }}
            className={inputClass}
            placeholder="e.g. paid online"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Paid via
          </label>
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
                {m === "Cash" ? "💵 Cash" : "📱 Online"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          <span>
            {rechargeId.trim() || "ID"} · {monthLabel(month)}
          </span>
          <span>{formatCurrency(Number(amount) || 0)}</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
