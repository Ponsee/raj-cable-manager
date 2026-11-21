import { useState } from "react";
import { unitLabel } from "../../utils/unitLabels";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// One Serial + MAC row per unit being added (both optional — they can be filled in
// later on the Modems page). A paste box fills the rows from a list copied from
// Excel / WhatsApp: one unit per line, "MAC" or "MAC, serial" (or tab separated).
export function UnitRows({ qty, rows, onChange }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const n = Math.min(Math.max(Math.round(qty) || 0, 0), 200);
  if (n === 0) return null;

  const set = (i, patch) => {
    const next = Array.from({ length: n }, (_, k) => rows[k] || {});
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const applyPaste = () => {
    const lines = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    onChange(
      Array.from({ length: n }, (_, k) => {
        const parts = (lines[k] || "").split(/[\t,;]+/).map((p) => p.trim());
        return lines[k] ? { mac_address: parts[0] || "", serial_no: parts[1] || "" } : rows[k] || {};
      })
    );
    setPasteOpen(false);
    setPaste("");
  };

  return (
    <div className="space-y-2 rounded-lg bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          MAC address & serial for each unit <span className="font-normal text-gray-400">(optional now)</span>
        </p>
        <button type="button" onClick={() => setPasteOpen((o) => !o)} className="text-xs font-medium text-indigo-600 hover:underline">
          {pasteOpen ? "Close" : "Paste a list"}
        </button>
      </div>
      {pasteOpen && (
        <div className="space-y-2">
          <textarea
            rows={4}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"One unit per line:\nAA:BB:CC:DD:EE:01, SN-1001\nAA:BB:CC:DD:EE:02, SN-1002"}
            className={inputClass + " font-mono"}
          />
          <button type="button" onClick={applyPaste} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white">
            Fill the rows
          </button>
        </div>
      )}
      <div className="max-h-56 space-y-1.5 overflow-auto pr-1">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr] items-center gap-2">
            <span className="text-xs text-gray-400">{i + 1}</span>
            <input
              value={rows[i]?.mac_address || ""}
              onChange={(e) => set(i, { mac_address: e.target.value })}
              placeholder="MAC  AA:BB:CC:DD:EE:FF"
              className={inputClass + " font-mono"}
            />
            <input
              value={rows[i]?.serial_no || ""}
              onChange={(e) => set(i, { serial_no: e.target.value })}
              placeholder="Serial"
              className={inputClass}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// "Which unit?" for a single sale / usage of a tracked product (default: oldest).
export function UnitSelect({ units, value, onChange }) {
  if (!units.length) return null;
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Which unit?</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass.replace("py-1.5", "py-2")}>
        <option value="">Oldest in stock (automatic)</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>{unitLabel(u)}</option>
        ))}
      </select>
    </div>
  );
}
