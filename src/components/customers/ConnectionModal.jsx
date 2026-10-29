import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import {
  createConnection,
  updateConnection,
} from "../../services/connectionsService";
import { addProviderField } from "../../services/providersService";
import { setLineModem } from "../../services/modemsService";
import {
  providerDefaults,
  joinFieldValues,
  slugifyKey,
  normalizeMac,
  modemOnLine,
  todayISO,
} from "../../utils/ftu";
import { CONNECTION_STATUS, CONNECTION_STATUS_LABELS } from "../../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

// Password-style input with a show / hide toggle.
function SecretInput({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value ?? ""}
        onChange={onChange}
        className={inputClass + " pr-14"}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:underline"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

const pretty = (key) =>
  key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Add or edit one internet line. The form below the provider is that provider's
// own field list (BSNL and TIC differ); "+ Add field" extends it.
export default function ConnectionModal({
  open,
  onClose,
  customerId,
  connection,
  providers,
  onProviderUpdated,
  onSaved,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={connection ? "Edit connection" : "Add connection"}
      size="lg"
    >
      {/* Mounted per open, so the form state starts fresh each time. */}
      {open && (
        <Body
          customerId={customerId}
          connection={connection}
          providers={providers}
          onProviderUpdated={onProviderUpdated}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function Body({ customerId, connection, providers, onProviderUpdated, onSaved, onClose }) {
  const editing = !!connection;
  const startProvider = editing
    ? providers.find((p) => p.id === connection.provider_id) || connection.provider
    : providers[0];
  const startModem = connection ? modemOnLine(connection.modems) : null;

  const [providerId, setProviderId] = useState(startProvider?.id || "");
  const provider =
    providers.find((p) => p.id === providerId) ||
    (startProvider?.id === providerId ? startProvider : null);
  const fields = provider?.fields || [];

  const [values, setValues] = useState(() =>
    editing ? joinFieldValues(startProvider?.fields, connection) : providerDefaults(startProvider?.fields)
  );
  // One-off fields: values saved on this connection only (not in the provider list).
  const [extras, setExtras] = useState(() =>
    editing
      ? Object.keys(connection.details || {})
          .filter((k) => !(startProvider?.fields || []).some((f) => f.key === k))
          .map((k) => ({ key: k, label: pretty(k), type: "text" }))
      : []
  );
  const [installedOn, setInstalledOn] = useState(connection?.installed_on || (editing ? "" : todayISO()));
  const [planAmount, setPlanAmount] = useState(connection?.plan_amount ?? "");
  const [status, setStatus] = useState(connection?.status || CONNECTION_STATUS.ACTIVE);
  const [lastRechargeOn, setLastRechargeOn] = useState(connection?.last_recharge_on || "");
  const [modemKind, setModemKind] = useState(
    startModem ? (startModem.ownership === "ftu" ? "ftu" : "customer") : "none"
  );
  const [mac, setMac] = useState(startModem?.mac_address || "");
  const [serial, setSerial] = useState(startModem?.serial_no || "");

  const [af, setAf] = useState(null); // "+ Add field" mini form
  const [savedConn, setSavedConn] = useState(null); // set once the line is created
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setValue = (key, v) => setValues((s) => ({ ...s, [key]: v }));

  const changeProvider = (id) => {
    const p = providers.find((x) => x.id === id);
    setProviderId(id);
    setValues(providerDefaults(p?.fields)); // e.g. BSNL password = "password"
    setExtras([]);
  };

  const addField = async () => {
    const label = (af.label || "").trim();
    if (!label) return setError("Enter a name for the field.");
    setError("");
    try {
      if (af.onlyThis) {
        const taken = new Set([...fields.map((f) => f.key), ...extras.map((x) => x.key)]);
        const base = slugifyKey(label) || "field";
        let key = base;
        for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
        setExtras((x) => [...x, { key, label, type: af.type }]);
      } else {
        const updated = await addProviderField(providerId, { label, type: af.type });
        onProviderUpdated(updated);
      }
      setAf(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!provider) return setError("Pick a provider.");
    if (!editing && !savedConn) {
      const missing = fields.filter((f) => f.required && !String(values[f.key] ?? "").trim());
      if (missing.length) return setError(`Fill in: ${missing.map((f) => f.label).join(", ")}.`);
    }
    const macNorm = normalizeMac(mac);
    if (macNorm === null) return setError("Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).");

    setSaving(true);
    try {
      const payload = { provider, values, installedOn, planAmount, status, lastRechargeOn };
      let id = connection?.id || savedConn?.id;
      if (id) await updateConnection(id, payload);
      else {
        const created = await createConnection({ customerId, ...payload });
        setSavedConn(created); // a retry after a modem error updates instead of duplicating
        id = created.id;
      }
      if (modemKind !== "none" || startModem)
        await setLineModem(id, modemKind, { mac_address: macNorm, serial_no: serial });
      await onSaved();
      onClose();
    } catch (err) {
      setError(
        savedConn || !editing
          ? `${err.message} (The connection itself was saved — fix this and save again.)`
          : err.message
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <Field label="Provider" required>
        <select
          value={providerId}
          onChange={(e) => changeProvider(e.target.value)}
          disabled={editing}
          className={inputClass}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {editing && !providers.some((p) => p.id === providerId) && (
            <option value={providerId}>{startProvider?.name}</option>
          )}
        </select>
      </Field>

      {/* The provider's own fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required && !editing}>
            {f.type === "secret" || f.secret ? (
              <SecretInput value={values[f.key]} onChange={(e) => setValue(f.key, e.target.value)} />
            ) : (
              <input
                type={f.type === "number" || f.type === "date" ? f.type : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValue(f.key, e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        ))}
        {extras.map((x) => (
          <Field key={x.key} label={`${x.label} (this connection only)`}>
            <div className="flex gap-2">
              {x.type === "secret" ? (
                <SecretInput value={values[x.key]} onChange={(e) => setValue(x.key, e.target.value)} />
              ) : (
                <input
                  type={x.type === "number" || x.type === "date" ? x.type : "text"}
                  value={values[x.key] ?? ""}
                  onChange={(e) => setValue(x.key, e.target.value)}
                  className={inputClass}
                />
              )}
              <button
                type="button"
                title="Remove this field"
                onClick={() => {
                  setExtras((l) => l.filter((y) => y.key !== x.key));
                  setValue(x.key, "");
                }}
                className="px-1 text-lg text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          </Field>
        ))}
      </div>

      {/* + Add field */}
      {af ? (
        <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={af.label}
              onChange={(e) => setAf({ ...af, label: e.target.value })}
              placeholder="Field name, e.g. ONU Serial"
              className={inputClass + " sm:col-span-2"}
              autoFocus
            />
            <select
              value={af.type}
              onChange={(e) => setAf({ ...af, type: e.target.value })}
              className={inputClass}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="secret">Secret (masked)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={af.onlyThis}
              onChange={(e) => setAf({ ...af, onlyThis: e.target.checked })}
            />
            Only this connection (otherwise added to every {provider?.name} connection)
          </label>
          <div className="flex gap-2">
            <Button type="button" onClick={addField}>
              Add field
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAf(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAf({ label: "", type: "text", onlyThis: false })}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          + Add field
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Plan amount (₹)">
          <input
            type="number"
            min="0"
            step="any"
            value={planAmount}
            onChange={(e) => setPlanAmount(e.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {Object.values(CONNECTION_STATUS).map((s) => (
              <option key={s} value={s}>
                {CONNECTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Install date">
          <input
            type="date"
            value={installedOn || ""}
            onChange={(e) => setInstalledOn(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Last recharge date">
          <input
            type="date"
            value={lastRechargeOn || ""}
            onChange={(e) => setLastRechargeOn(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-400">Leave blank if not known yet.</p>
        </Field>
      </div>

      {/* Modem on this line */}
      <div className="space-y-3 rounded-lg bg-gray-50 p-3">
        <p className="text-sm font-medium text-gray-700">Modem on this connection</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["none", "None / unknown"],
            ["ftu", "FTU (ours)"],
            ["customer", "Own modem"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModemKind(k)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                modemKind === k
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {modemKind !== "none" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="MAC address">
              <input
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                className={inputClass + " font-mono"}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
            </Field>
            <Field label="Serial number">
              <input
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {saving ? "Saving..." : "Save connection"}
        </Button>
      </div>
    </form>
  );
}
