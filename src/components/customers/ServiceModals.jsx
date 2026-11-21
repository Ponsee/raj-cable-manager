import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { getProducts } from "../../services/productsService";
import {
  sendToService,
  completeService,
  cancelService,
  removeServiceEntries,
} from "../../services/modemRepairService";
import { unitOptionLabel } from "../../utils/newInternet";
import { SERVICE_OUTCOME_LABELS, serviceCostSummary } from "../../utils/modemService";
import { daysSince, todayISO } from "../../utils/ftu";
import { formatCurrency, formatDate } from "../../utils/format";
import { SERVICE_OUTCOME } from "../../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
const Err = ({ error }) =>
  error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;
const Money = ({ value, onChange, placeholder = "0" }) => (
  <input type="number" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder={placeholder} />
);
function PayToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {["Cash", "Online"].map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)}
          className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
            value === m ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}>
          {m}
        </button>
      ))}
    </div>
  );
}

const inStockUnits = (modems) => modems.filter((m) => m.status === "in_stock");

// ---------- 1. Send a faulty modem to service ----------
export function SendToServiceModal({ open, onClose, modem, modems, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Send faulty modem to service">
      {open && modem && <SendBody modem={modem} modems={modems} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function SendBody({ modem, modems, onClose, onSaved }) {
  const cust = modem.connection?.customer;
  const [brand, setBrand] = useState(modem.product?.subcategory || "");
  const [claim, setClaim] = useState("");
  const [date, setDate] = useState(todayISO());
  const [parcel, setParcel] = useState("");
  const [payment, setPayment] = useState("Cash");
  const [giveTemp, setGiveTemp] = useState(true);
  const [tempId, setTempId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const units = inStockUnits(modems);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (giveTemp && !tempId) return setError("Pick the temporary modem, or untick the box.");
    setSaving(true);
    try {
      await sendToService(modem, {
        brand,
        claimNo: claim,
        parcelOutCost: parcel,
        paymentMethod: payment,
        date,
        tempUnit: giveTemp ? units.find((u) => u.id === tempId) : undefined,
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
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        {unitOptionLabel(modem)} — with <b>{cust?.name}</b> ({modem.connection?.provider?.name})
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Brand / service centre *">
          <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} placeholder="e.g. Huawei" autoFocus />
        </Field>
        <Field label="Claim / RMA number">
          <input value={claim} onChange={(e) => setClaim(e.target.value)} className={inputClass} placeholder="Optional" />
        </Field>
        <Field label="Sent on">
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Parcel charge to the brand (₹)">
          <Money value={parcel} onChange={setParcel} />
        </Field>
      </div>
      {Number(parcel) > 0 && (
        <Field label="Paid via"><PayToggle value={payment} onChange={setPayment} /></Field>
      )}

      <div className="space-y-2 rounded-lg bg-gray-50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={giveTemp} onChange={(e) => setGiveTemp(e.target.checked)} />
          Give the customer a temporary modem now (FTU, from stock)
        </label>
        {giveTemp && (
          <>
            <select value={tempId} onChange={(e) => setTempId(e.target.value)} className={inputClass}>
              <option value="">— Pick a modem in stock —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{unitOptionLabel(u)}</option>
              ))}
            </select>
            {units.length === 0 && (
              <p className="text-xs text-amber-700">
                No modem units are marked "In stock". This list shows only units on the Modems page, not the product's stock
                quantity. On Products, tick "Track each unit" for the modem product and press "missing — add", or use Add modem.
                You can also untick the box above and send it without a temporary modem.
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>{saving ? "Saving..." : "Send to service"}</Button>
      </div>
    </form>
  );
}

// ---------- 2. The brand's answer ----------
const OUTCOMES = [
  [SERVICE_OUTCOME.WARRANTY_REPLACED, "Under warranty", "The brand sends a new modem. Only parcel costs."],
  [SERVICE_OUTCOME.REPAIRED, "Repaired", "Not under warranty; fixed for a fee."],
  [SERVICE_OUTCOME.UPGRADE, "Upgrade to a new model", "We pay the brand, the customer pays us."],
  [SERVICE_OUTCOME.KEEP_FTU, "Customer keeps an FTU modem", "Not covered; the faulty one is written off."],
];

export function ServiceResultModal({ open, onClose, modem, modems, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Service result" size="lg">
      {open && modem && <ResultBody modem={modem} modems={modems} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function ResultBody({ modem, modems, onClose, onSaved }) {
  const svc = modem.service || {};
  const temp = modems.find(
    (m) => m.id === svc.temp_unit_id && m.status === "with_customer" && m.connection_id === svc.for_connection_id
  );
  const [outcome, setOutcome] = useState("");
  const [date, setDate] = useState(todayISO());
  const [payment, setPayment] = useState("Cash");
  const [parcelBack, setParcelBack] = useState("");
  const [serviceCost, setServiceCost] = useState("");
  const [giveBackTo, setGiveBackTo] = useState("customer");
  const [upgradeCost, setUpgradeCost] = useState("");
  const [customerPaid, setCustomerPaid] = useState("");
  const [mac, setMac] = useState("");
  const [serial, setSerial] = useState("");
  const [productId, setProductId] = useState("");
  const [stockUnitId, setStockUnitId] = useState("");
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getProducts()
      .then((p) => alive && setProducts(p.filter((x) => (x.category || "").trim().toLowerCase() === "router")))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const units = inStockUnits(modems);
  const hasMoney = [parcelBack, serviceCost, upgradeCost, customerPaid].some((v) => Number(v) > 0);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!outcome) return setError("Pick what the brand decided.");
    setSaving(true);
    try {
      await completeService(modem, {
        outcome,
        date,
        paymentMethod: payment,
        parcelBackCost: parcelBack,
        serviceCost,
        giveBackTo,
        upgradeCost,
        customerPaid,
        newUnit: { mac_address: mac, serial_no: serial, product_id: productId },
        stockUnit: units.find((u) => u.id === stockUnitId),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const newUnitFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="New modem MAC address">
        <input value={mac} onChange={(e) => setMac(e.target.value)} className={inputClass + " font-mono"} placeholder="AA:BB:CC:DD:EE:FF" />
      </Field>
      <Field label="New modem serial">
        <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClass} placeholder="Optional" />
      </Field>
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      <Err error={error} />
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        {unitOptionLabel(modem)} · {svc.customer_name} ({svc.provider_name}) · with {svc.brand}
        {svc.claim_no ? ` · claim ${svc.claim_no}` : ""} · {daysSince(svc.sent_on)} days
        {temp && <span className="block text-xs text-gray-500">Temporary modem on the line: {unitOptionLabel(temp)}</span>}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OUTCOMES.map(([k, title, desc]) => (
          <button key={k} type="button" onClick={() => setOutcome(k)}
            className={`rounded-lg border p-3 text-left transition ${
              outcome === k ? "border-indigo-600 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
            }`}>
            <p className={`text-sm font-semibold ${outcome === k ? "text-indigo-700" : "text-gray-800"}`}>{title}</p>
            <p className="text-xs text-gray-500">{desc}</p>
          </button>
        ))}
      </div>

      {outcome === SERVICE_OUTCOME.WARRANTY_REPLACED && newUnitFields}

      {outcome === SERVICE_OUTCOME.REPAIRED && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Repair cost (₹)"><Money value={serviceCost} onChange={setServiceCost} /></Field>
          <Field label="After the repair, the modem goes">
            <select value={giveBackTo} onChange={(e) => setGiveBackTo(e.target.value)} className={inputClass}>
              <option value="customer">Back to the customer{temp ? " (temporary goes to stock)" : ""}</option>
              <option value="stock">To stock{temp ? " (customer keeps the temporary)" : ""}</option>
            </select>
          </Field>
        </div>
      )}

      {outcome === SERVICE_OUTCOME.UPGRADE && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Upgrade cost we pay the brand (₹)"><Money value={upgradeCost} onChange={setUpgradeCost} /></Field>
            <Field label="Customer pays us (₹)" hint="Can be different from what we paid.">
              <Money value={customerPaid} onChange={setCustomerPaid} />
            </Field>
          </div>
          {(Number(upgradeCost) > 0 || Number(customerPaid) > 0) && (
            <p className={`rounded-lg px-3 py-2 text-sm ${Number(customerPaid) - Number(upgradeCost) >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {Number(customerPaid) - Number(upgradeCost) >= 0 ? "Profit" : "Loss"} on this upgrade:{" "}
              <b>{formatCurrency(Math.abs(Number(customerPaid) - Number(upgradeCost)))}</b>
            </p>
          )}
          <Field label="New model (Router products, optional)">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
              <option value="">Same as before</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.subcategory ? ` (${p.subcategory})` : ""}</option>
              ))}
            </select>
          </Field>
          {newUnitFields}
        </div>
      )}

      {outcome === SERVICE_OUTCOME.KEEP_FTU && !temp && (
        <Field label="FTU modem the customer will keep (from stock)" hint="No temporary modem is on the line, so pick one now (stock goes down by 1).">
          <select value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} className={inputClass}>
            <option value="">— Pick a modem in stock —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{unitOptionLabel(u)}</option>
            ))}
          </select>
        </Field>
      )}

      {outcome && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Parcel charge back (₹)"><Money value={parcelBack} onChange={setParcelBack} /></Field>
          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          {hasMoney && <Field label="Paid via"><PayToggle value={payment} onChange={setPayment} /></Field>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={!outcome}>{saving ? "Saving..." : "Save result"}</Button>
      </div>
    </form>
  );
}

// ---------- 3. Details (+ bring back / remove entries) ----------
export function ServiceDetailsModal({ open, onClose, modem, isAdmin, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Service details">
      {open && modem && <DetailsBody modem={modem} isAdmin={isAdmin} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function DetailsBody({ modem, isAdmin, onClose, onSaved }) {
  const svc = modem.service || {};
  const sum = serviceCostSummary(svc);
  const [ask, setAsk] = useState(""); // "cancel" | "remove"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const waiting = modem.status === "with_service" && !svc.outcome;
  const hasEntries = !!(svc.expense_ids?.length || svc.income_id);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn(modem);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const row = (label, value) =>
    value ? (
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="text-right font-medium text-gray-800">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <Err error={error} />
      <div className="space-y-1 rounded-lg bg-gray-50 p-3">
        {row("Modem", unitOptionLabel(modem))}
        {row("Customer", `${svc.customer_name || "—"}${svc.provider_name ? ` (${svc.provider_name})` : ""}`)}
        {row("Brand", svc.brand)}
        {row("Claim number", svc.claim_no)}
        {row("Sent on", svc.sent_on && `${formatDate(svc.sent_on)} (${daysSince(svc.sent_on)} days${svc.completed_on ? " ago" : " so far"})`)}
        {row("Result", svc.outcome ? `${SERVICE_OUTCOME_LABELS[svc.outcome]}${svc.completed_on ? ` · ${formatDate(svc.completed_on)}` : ""}` : "Waiting for the brand")}
      </div>

      <div className="space-y-1 rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-semibold uppercase text-gray-400">Money</p>
        {row("Parcel (to + back)", sum.parcel > 0 && formatCurrency(sum.parcel))}
        {row("Repair", sum.service > 0 && formatCurrency(sum.service))}
        {row("Upgrade (paid to the brand)", sum.upgrade > 0 && formatCurrency(sum.upgrade))}
        {row("Customer paid us", sum.paid > 0 && formatCurrency(sum.paid))}
        <div className="flex justify-between border-t border-gray-100 pt-1 text-sm font-semibold">
          <span>{sum.net >= 0 ? "Net" : "Net cost"}</span>
          <span className={sum.net >= 0 ? "text-green-700" : "text-red-700"}>{formatCurrency(Math.abs(sum.net))}</span>
        </div>
        {svc.entries_removed && <p className="text-xs text-gray-400">The expense / income entries were removed.</p>}
      </div>

      {ask ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            {ask === "cancel"
              ? "Bring the modem back to the customer? The temporary modem goes back to stock and the parcel expense is deleted."
              : "Delete the expense and income entries this service created? The modem record stays."}
          </p>
          <div className="flex gap-2">
            <Button variant="danger" loading={busy} onClick={() => run(ask === "cancel" ? cancelService : removeServiceEntries)}>Yes, do it</Button>
            <Button variant="secondary" onClick={() => setAsk("")} disabled={busy}>No</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {waiting && <Button variant="secondary" onClick={() => setAsk("cancel")}>Sent by mistake — bring back</Button>}
          {isAdmin && hasEntries && <Button variant="secondary" onClick={() => setAsk("remove")}>Remove expense entries</Button>}
          <Button onClick={onClose}>Close</Button>
        </div>
      )}
    </div>
  );
}
