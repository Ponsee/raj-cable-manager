import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { markLost, markNoticeSent, updateModem } from "../../services/modemsService";
import { issueUnit, addModemToStock } from "../../services/modemFlowService";
import { getCustomers } from "../../services/customersService";
import { getProducts } from "../../services/productsService";
import { addPending } from "../../services/pendingService";
import { normalizeMac, todayISO, modemOnLine } from "../../utils/ftu";
import { formatDate, formatCurrency } from "../../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

const Err = ({ error }) =>
  error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;

const modemLabel = (m) =>
  [m.product?.name, m.mac_address, m.serial_no].filter(Boolean).join(" · ") || "Modem (no details yet)";

// Indian mobile for wa.me / sms links ("9000000001" -> "919000000001").
const intlPhone = (p) => {
  const d = String(p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `91${d}` : "";
};

// ---------- + Add modem (an in-stock unit) ----------
export function AddModemModal({ open, onClose, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Add modem to stock">
      {open && <AddBody onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function AddBody({ onClose, onSaved }) {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [serial, setSerial] = useState("");
  const [mac, setMac] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getProducts()
      // Modems are Router products, so only those can be picked.
      .then((p) => alive && setProducts(p.filter((x) => (x.category || "").trim().toLowerCase() === "router")))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const m = normalizeMac(mac);
    if (m === null) return setError("Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).");
    setSaving(true);
    try {
      await addModemToStock({
        productId,
        productName: products.find((p) => p.id === productId)?.name,
        serial_no: serial,
        mac_address: m,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Err error={error} />
      <Field label="Modem product (Router category, optional)">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
          <option value="">— Not linked to a product —</option>
          {products.length === 0 && <option disabled>No products in the Router category</option>}
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.subcategory ? ` (${p.subcategory})` : ""}
              {p.track_units ? " — tracked" : ""}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="MAC address">
          <input value={mac} onChange={(e) => setMac(e.target.value)} className={inputClass + " font-mono"} placeholder="AA:BB:CC:DD:EE:FF" autoFocus />
        </Field>
        <Field label="Serial number">
          <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClass} placeholder="Optional" />
        </Field>
      </div>
      <p className="text-xs text-gray-400">
        {products.find((p) => p.id === productId)?.track_units
          ? "This product tracks units: adding one also adds 1 to its stock (no expense is recorded)."
          : "This adds a unit to this list only. It does not change product stock or create an expense."}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>{saving ? "Saving..." : "Add modem"}</Button>
      </div>
    </form>
  );
}

// ---------- Issue an in-stock unit to a customer's line ----------
export function IssueModal({ open, onClose, modem, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Issue modem to a customer">
      {open && modem && <IssueBody modem={modem} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function IssueBody({ modem, onClose, onSaved }) {
  const [lines, setLines] = useState(null);
  const [q, setQ] = useState("");
  const [connId, setConnId] = useState("");
  const [ownership, setOwnership] = useState("ftu");
  const [price, setPrice] = useState("");
  const [payment, setPayment] = useState("Cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getCustomers()
      .then((cs) => {
        if (!alive) return;
        // Only lines that don't already have a modem (one modem per line).
        setLines(
          cs.flatMap((c) =>
            c.connections
              .filter((l) => !modemOnLine(l.modems))
              .map((l) => ({
                id: l.id,
                customer: c.name,
                label: `${c.name} · ${l.provider?.name}${l.username ? ` · ${l.username}` : ""}`,
              }))
          )
        );
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const shown = (lines || []).filter((l) => l.label.toLowerCase().includes(q.trim().toLowerCase()));
  const selling = ownership === "customer" && !!modem.product_id; // a sale of a stock item

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await issueUnit(modem, connId, ownership, {
        sellPrice: price,
        paymentMethod: payment,
        customerName: lines?.find((l) => l.id === connId)?.customer,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Err error={error} />
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{modemLabel(modem)}</p>
      <Field label="Customer connection">
        <input value={q} onChange={(e) => setQ(e.target.value)} className={inputClass + " mb-2"} placeholder="Search customer, provider or user name..." />
        <select size={6} value={connId} onChange={(e) => setConnId(e.target.value)} className={inputClass}>
          {lines === null && <option disabled>Loading...</option>}
          {lines && shown.length === 0 && <option disabled>No connection without a modem matches</option>}
          {shown.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Whose modem is it?">
        <div className="grid grid-cols-2 gap-2">
          {[["ftu", "FTU (ours, collect if overdue)"], ["customer", "Customer's (sold)"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setOwnership(k)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                ownership === k ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      {selling && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Selling price (₹, 0 = given free)">
            <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="0" />
          </Field>
          <Field label="Paid via">
            <div className="grid grid-cols-2 gap-2">
              {["Cash", "Online"].map((m) => (
                <button key={m} type="button" onClick={() => setPayment(m)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                    payment === m ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
      {modem.product_id && (
        <p className="text-xs text-gray-400">
          Product stock goes down by 1{selling && Number(price) > 0 ? " and the sale is added to Income" : ""}.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={!connId}>{saving ? "Saving..." : "Issue modem"}</Button>
      </div>
    </form>
  );
}

// ---------- Notice sent (+ WhatsApp / SMS link) ----------
export function NoticeModal({ open, onClose, modem, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Send notice">
      {open && modem && <NoticeBody modem={modem} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function NoticeBody({ modem, onClose, onSaved }) {
  const cust = modem.connection?.customer;
  const last = modem.connection?.last_recharge_on;
  const [text, setText] = useState(
    `Hello ${cust?.name || ""}, your ${modem.connection?.provider?.name || "internet"} connection ` +
      (last ? `was last recharged on ${formatDate(last)}. ` : "has not been recharged. ") +
      "Please recharge soon, or return the modem. Thank you."
  );
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const phone = intlPhone(cust?.phone);

  const send = async (url) => {
    if (url) window.open(url, "_blank", "noopener"); // open first so the browser allows it
    setSaving(true);
    setError("");
    try {
      await markNoticeSent(modem.id, date);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const msg = encodeURIComponent(text);
  return (
    <div className="space-y-4">
      <Err error={error} />
      <p className="text-sm text-gray-600">
        To <b>{cust?.name}</b>
        {cust?.phone ? ` (${cust.phone})` : " — no phone number saved"}
        {modem.notice_sent_on && <span className="text-amber-700"> · last notice {formatDate(modem.notice_sent_on)}</span>}
      </p>
      <Field label="Message">
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Notice date">
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputClass + " sm:max-w-xs"} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="secondary" loading={saving} onClick={() => send("")}>Just mark as sent</Button>
        <Button type="button" disabled={!phone || saving} onClick={() => send(`sms:+${phone}?body=${msg}`)}>SMS</Button>
        <Button type="button" disabled={!phone || saving} onClick={() => send(`https://wa.me/${phone}?text=${msg}`)}>WhatsApp</Button>
      </div>
    </div>
  );
}

// ---------- Mark lost (optionally charge the customer) ----------
export function LostModal({ open, onClose, modem, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Mark modem lost">
      {open && modem && <LostBody modem={modem} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function LostBody({ modem, onClose, onSaved }) {
  const cust = modem.connection?.customer;
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const amt = Number(amount) || 0;
      // Optional: put the modem's price on the customer's Pending list.
      if (amt > 0 && cust)
        await addPending({
          customerName: cust.name,
          description: `Lost modem${modem.serial_no ? ` ${modem.serial_no}` : ""}`,
          category: "Modem Sale",
          total: amt,
          paidNow: 0,
        });
      await markLost(modem.id);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Err error={error} />
      <p className="text-sm text-gray-600">
        {modemLabel(modem)} will be marked <b>lost</b> and taken off the line.
      </p>
      {cust && (
        <Field label={`Charge ${cust.name} for the modem (₹, optional)`}>
          <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass + " sm:max-w-xs"} placeholder="0" />
          {Number(amount) > 0 && (
            <p className="mt-1 text-xs text-gray-400">{formatCurrency(amount)} is added to Pending payments for this customer.</p>
          )}
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" loading={saving}>{saving ? "Saving..." : "Mark lost"}</Button>
      </div>
    </form>
  );
}

// ---------- Edit a unit's MAC / serial ----------
export function EditModemModal({ open, onClose, modem, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Edit modem details">
      {open && modem && <EditBody modem={modem} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function EditBody({ modem, onClose, onSaved }) {
  const [mac, setMac] = useState(modem.mac_address || "");
  const [serial, setSerial] = useState(modem.serial_no || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const m = normalizeMac(mac);
    if (m === null) return setError("Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).");
    setSaving(true);
    try {
      await updateModem(modem.id, { mac_address: m, serial_no: serial });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Err error={error} />
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        {modem.product?.name || "Modem (no product)"}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="MAC address">
          <input value={mac} onChange={(e) => setMac(e.target.value)} className={inputClass + " font-mono"} placeholder="AA:BB:CC:DD:EE:FF" autoFocus />
        </Field>
        <Field label="Serial number">
          <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClass} placeholder="Optional" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>{saving ? "Saving..." : "Save"}</Button>
      </div>
    </form>
  );
}
