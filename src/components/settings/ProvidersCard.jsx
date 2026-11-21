import { useEffect, useState } from "react";
import Button from "../ui/Button";
import {
  getProviders,
  createProvider,
  updateProvider,
} from "../../services/providersService";
import { slugifyKey } from "../../utils/ftu";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Every provider needs these three (they fill real connection columns).
const CORE_FIELDS = [
  { key: "username", label: "User Name", type: "text", required: true, column: "username" },
  { key: "password", label: "Password", type: "secret", secret: true, required: true, column: "password" },
  { key: "plan_name", label: "Plan Name", type: "text", column: "plan_name" },
];

// Admin: providers (BSNL, TIC Fiber ...) and the form fields each one shows.
export default function ProvidersCard() {
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = () =>
    getProviders({ includeInactive: true })
      .then(setProviders)
      .catch((e) => setError(e.message));

  useEffect(() => {
    let alive = true;
    getProviders({ includeInactive: true })
      .then((p) => alive && setProviders(p))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const addProvider = async (e) => {
    e.preventDefault();
    setError("");
    setAdding(true);
    try {
      await createProvider({ name, fields: CORE_FIELDS });
      setName("");
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 font-semibold text-gray-800">Internet providers & their fields</h3>
      <p className="mb-4 text-xs text-gray-500">
        Each provider's connection form shows these fields. Renaming or deleting a field keeps the
        values already saved on connections.
      </p>
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {providers === null ? (
        <p className="text-sm text-gray-400">Loading providers...</p>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderEditor key={p.id} provider={p} onSaved={reload} />
          ))}
        </div>
      )}

      <form onSubmit={addProvider} className="mt-4 flex gap-2 border-t border-gray-100 pt-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New provider name, e.g. Airtel Xstream"
          className={inputClass + " max-w-xs"}
        />
        <Button type="submit" loading={adding} disabled={!name.trim()}>
          + Add provider
        </Button>
      </form>
    </div>
  );
}

function ProviderEditor({ provider, onSaved }) {
  const [name, setName] = useState(provider.name);
  const [active, setActive] = useState(provider.active);
  const [fields, setFields] = useState(provider.fields || []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const patch = (i, p) => setFields((f) => f.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) =>
    setFields((f) => {
      const j = i + d;
      if (j < 0 || j >= f.length) return f;
      const n = [...f];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const addField = () =>
    setFields((f) => {
      let key = "field";
      for (let i = 2; f.some((x) => x.key === key); i++) key = `field_${i}`;
      return [...f, { key, label: "", type: "text", required: false, isNew: true }];
    });

  const save = async () => {
    setMsg("");
    setErr("");
    if (!name.trim()) return setErr("Enter the provider's name.");
    const labels = fields.map((f) => f.label.trim().toLowerCase());
    if (labels.some((l) => !l)) return setErr("Every field needs a name.");
    if (new Set(labels).size !== labels.length) return setErr("Two fields have the same name.");

    // New fields get a key from their name; existing keys never change (saved values depend on them).
    const taken = new Set(fields.filter((f) => !f.isNew).map((f) => f.key));
    const clean = fields.map((f) => {
      const { isNew, ...rest } = f;
      let key = rest.key;
      if (isNew) {
        const base = slugifyKey(f.label) || "field";
        key = base;
        for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
        taken.add(key);
      }
      const out = { ...rest, key, label: f.label.trim(), secret: f.type === "secret" };
      if (!out.secret) delete out.secret;
      if (out.default === "" || out.default === undefined) delete out.default;
      return out;
    });

    setSaving(true);
    try {
      await updateProvider(provider.id, { name: name.trim(), active, fields: clean });
      setMsg("Saved.");
      await onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass + " max-w-xs font-semibold"} />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (shown in forms)
        </label>
        <div className="ml-auto">
          <Button onClick={save} loading={saving}>{saving ? "Saving..." : "Save provider"}</Button>
        </div>
      </div>
      {err && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase text-gray-400">
            <tr>
              <th className="px-1 py-1">Field name</th>
              <th className="px-1 py-1">Type</th>
              <th className="px-1 py-1">Required</th>
              <th className="px-1 py-1">Default value</th>
              <th className="px-1 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const core = !!f.column;
              return (
                <tr key={f.key + i} className="align-middle">
                  <td className="px-1 py-1">
                    <input value={f.label} onChange={(e) => patch(i, { label: e.target.value })} className={inputClass} placeholder="e.g. ONU Serial" />
                  </td>
                  <td className="px-1 py-1">
                    <select value={f.type || "text"} disabled={core} onChange={(e) => patch(i, { type: e.target.value })} className={inputClass}>
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="secret">Secret (masked)</option>
                    </select>
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input type="checkbox" checked={!!f.required} onChange={(e) => patch(i, { required: e.target.checked })} />
                  </td>
                  <td className="px-1 py-1">
                    <input value={f.default ?? ""} onChange={(e) => patch(i, { default: e.target.value })} className={inputClass} placeholder="None" />
                  </td>
                  <td className="whitespace-nowrap px-1 py-1 text-right">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-gray-500 hover:text-indigo-600 disabled:opacity-30" title="Move up">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="px-1 text-gray-500 hover:text-indigo-600 disabled:opacity-30" title="Move down">↓</button>
                    <button
                      type="button"
                      disabled={core}
                      onClick={() => setFields((l) => l.filter((_, j) => j !== i))}
                      className="px-1 text-lg text-gray-400 hover:text-red-600 disabled:opacity-30"
                      title={core ? "User name, password and plan name can't be removed" : "Delete field"}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addField} className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
        + Add field
      </button>
    </div>
  );
}
