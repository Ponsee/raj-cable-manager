import { useState } from "react";
import * as XLSX from "xlsx";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { getCustomers } from "../../services/customersService";
import { runImport } from "../../services/importService";
import {
  autoMap,
  buildTargets,
  cleanRows,
  classifyRows,
  templateRows,
} from "../../utils/importCustomers";
import { CONNECTION_STATUS, CONNECTION_STATUS_LABELS } from "../../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const KIND_STYLE = {
  new: "bg-green-100 text-green-700",
  existing: "bg-blue-100 text-blue-700",
  possible_duplicate: "bg-amber-100 text-amber-700",
  duplicate: "bg-gray-100 text-gray-600",
  error: "bg-red-100 text-red-700",
};
const KIND_LABEL = {
  new: "New customer",
  existing: "Existing customer",
  possible_duplicate: "Possible duplicate",
  duplicate: "Already saved",
  error: "Error",
};

// Import customers + connections from an Excel / CSV sheet, in 4 steps:
// choose file + provider -> match columns -> preview -> import.
export default function ImportModal({ open, onClose, providers, onDone }) {
  return (
    <Modal open={open} onClose={onClose} title="Import customers from a sheet" size="lg">
      {open && <Wizard providers={providers} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function Wizard({ providers, onClose, onDone }) {
  const [step, setStep] = useState("upload"); // upload | map | preview | done
  const [providerId, setProviderId] = useState(providers[0]?.id || "");
  const provider = providers.find((p) => p.id === providerId);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [opts, setOpts] = useState({
    dateOrder: "mdy",
    defaultStatus: CONNECTION_STATUS.ACTIVE,
    lastRechargeAll: "",
    macKind: "customer",
    fillPlanAmount: true,
  });
  const [rows, setRows] = useState([]); // classified rows
  const [include, setInclude] = useState({}); // row n -> bool
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([0, 0]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const setOpt = (k, v) => setOpts((o) => ({ ...o, [k]: v }));

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet(templateRows(provider));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, provider?.name?.slice(0, 31) || "Customers");
    XLSX.writeFile(wb, `${provider?.name || "provider"}-customers-template.xlsx`);
  };

  const onFile = async (file) => {
    setError("");
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const hdr = (all[0] || []).map((h) => String(h).trim());
      const data = all.slice(1).filter((r) => r.some((c) => String(c).trim()));
      if (!hdr.length || !data.length) return setError("That sheet has no data rows.");
      // Default the provider from the file name ("BSNL FTTH (Responses).xlsx" -> BSNL).
      const guess = providers.find((p) => file.name.toLowerCase().includes(p.name.toLowerCase()));
      const prov = guess || provider;
      if (guess) setProviderId(guess.id);
      setFileName(file.name);
      setHeaders(hdr);
      setDataRows(data);
      setMapping(autoMap(hdr, prov));
    } catch (e) {
      setError(`Couldn't read that file: ${e.message}`);
    }
  };

  const changeProvider = (id) => {
    setProviderId(id);
    if (headers.length) setMapping(autoMap(headers, providers.find((p) => p.id === id)));
  };

  // One target per column; picking a taken target frees the other column.
  const setMap = (col, target) =>
    setMapping((m) => {
      const next = { ...m };
      if (target) for (const k of Object.keys(next)) if (next[k] === target) delete next[k];
      if (target) next[col] = target;
      else delete next[col];
      return next;
    });

  const toPreview = async () => {
    setError("");
    if (!Object.values(mapping).includes("name")) return setError('Match a column to "Customer name".');
    setBusy(true);
    try {
      const existing = await getCustomers();
      const cleaned = cleanRows(dataRows, mapping, provider, opts);
      const cls = classifyRows(cleaned, { customers: existing, provider });
      setRows(cls);
      setInclude(Object.fromEntries(cls.map((r) => [r.n, r.include])));
      setFilter("all");
      setStep("preview");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const chosen = rows.filter((r) => include[r.n] && r.kind !== "error");

  const doImport = async () => {
    setBusy(true);
    setError("");
    setProgress([0, chosen.length]);
    try {
      const res = await runImport(chosen, {
        provider,
        onProgress: (d, t) => setProgress([d, t]),
      });
      setResult(res);
      setStep("done");
      await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadFailed = () => {
    const aoa = [[...headers, "Import error"], ...result.failed.map((f) => [...f.raw, f.error])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Failed rows");
    XLSX.writeFile(wb, "failed-rows.xlsx");
  };

  const err = error ? (
    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
  ) : null;

  // ---- Step 1: file + provider ----
  if (step === "upload")
    return (
      <div className="space-y-4">
        {err}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Provider (for every row in the sheet)</label>
          <select value={providerId} onChange={(e) => changeProvider(e.target.value)} className={inputClass}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Excel or CSV file</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" />
          {fileName && (
            <p className="mt-1 text-xs text-green-700">
              {fileName}: {dataRows.length} rows, {headers.length} columns
            </p>
          )}
        </div>
        <button type="button" onClick={downloadTemplate} className="text-sm font-medium text-indigo-600 hover:underline">
          Download a blank {provider?.name} template
        </button>
        <p className="text-xs text-gray-400">
          Your file is read in the browser. Nothing is saved until you confirm on the last step.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!headers.length} onClick={() => setStep("map")}>Next: match columns</Button>
        </div>
      </div>
    );

  // ---- Step 2: match columns + options ----
  if (step === "map") {
    const targets = buildTargets(provider);
    return (
      <div className="space-y-4">
        {err}
        <p className="text-sm text-gray-600">
          Match each sheet column to a field. Columns left as "Ignore" are skipped.
        </p>
        <div className="max-h-72 overflow-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2">Sheet column</th><th className="px-3 py-2">Example</th><th className="px-3 py-2">Goes to</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {headers.map((h, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 font-medium">{h || `(column ${i + 1})`}</td>
                  <td className="max-w-[10rem] truncate px-3 py-1.5 text-gray-400">
                    {/pass/i.test(h) ? "••••" : String(dataRows[0]?.[i] ?? "")}
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={mapping[i] || ""} onChange={(e) => setMap(i, e.target.value)} className={inputClass}>
                      <option value="">Ignore</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Dates are written as</span>
            <select value={opts.dateOrder} onChange={(e) => setOpt("dateOrder", e.target.value)} className={inputClass}>
              <option value="mdy">Month / Day / Year (e.g. 2/15/20)</option>
              <option value="dmy">Day / Month / Year (e.g. 15/2/20)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Status when the sheet has none</span>
            <select value={opts.defaultStatus} onChange={(e) => setOpt("defaultStatus", e.target.value)} className={inputClass}>
              {Object.entries(CONNECTION_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Last recharge date for all rows (blank = "Not set")</span>
            <input type="date" value={opts.lastRechargeAll} onChange={(e) => setOpt("lastRechargeAll", e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-gray-500">Rows with a MAC address become</span>
            <select value={opts.macKind} onChange={(e) => setOpt("macKind", e.target.value)} className={inputClass}>
              <option value="customer">Own modem</option>
              <option value="ftu">FTU modem (ours)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={opts.fillPlanAmount} onChange={(e) => setOpt("fillPlanAmount", e.target.checked)} />
            Fill plan amount from the plan name where a price is obvious (e.g. 599/60Mbps → ₹599)
          </label>
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="secondary" onClick={() => setStep("upload")}>Back</Button>
          <Button type="button" loading={busy} onClick={toPreview}>Next: preview</Button>
        </div>
      </div>
    );
  }

  // ---- Step 3: preview ----
  if (step === "preview") {
    const count = (f) => rows.filter(f).length;
    const shown = rows.filter((r) =>
      filter === "all" ? true
        : filter === "import" ? include[r.n] && r.kind !== "error"
        : filter === "skip" ? !include[r.n] || r.kind === "error"
        : r.warnings.length > 0
    );
    return (
      <div className="space-y-3">
        {err}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">{chosen.length} will be imported</span>
          <span className="rounded-full bg-gray-100 px-3 py-1">{count((r) => r.kind === "new")} new · {count((r) => r.kind === "existing")} existing customers</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">{count((r) => r.kind === "possible_duplicate")} possible duplicates</span>
          <span className="rounded-full bg-gray-100 px-3 py-1">{count((r) => r.kind === "duplicate")} already saved</span>
          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{count((r) => r.kind === "error")} errors</span>
          <span className="rounded-full bg-gray-100 px-3 py-1">{count((r) => r.warnings.length > 0)} with notes</span>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputClass + " sm:w-60"}>
          <option value="all">Show all rows</option>
          <option value="import">Will import</option>
          <option value="skip">Skipped / errors</option>
          <option value="warn">Rows with notes</option>
        </select>

        <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-gray-50 uppercase text-gray-500">
              <tr>
                <th className="px-2 py-2">Import</th><th className="px-2 py-2">#</th><th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Phone</th><th className="px-2 py-2">User name</th><th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Installed</th><th className="px-2 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => (
                <tr key={r.n} className="align-top">
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={!!include[r.n] && r.kind !== "error"} disabled={r.kind === "error"}
                      onChange={(e) => setInclude((s) => ({ ...s, [r.n]: e.target.checked }))} />
                  </td>
                  <td className="px-2 py-1.5 text-gray-400">{r.n}</td>
                  <td className="px-2 py-1.5 font-medium">{r.customer.name || "—"}</td>
                  <td className="px-2 py-1.5">{r.customer.phone || "—"}</td>
                  <td className="max-w-[10rem] truncate px-2 py-1.5">{r.conn.cols.username || "—"}</td>
                  <td className="px-2 py-1.5">
                    {r.conn.cols.plan_name || "—"}
                    {r.conn.planAmount !== "" && <span className="text-gray-400"> · ₹{r.conn.planAmount}</span>}
                  </td>
                  <td className="px-2 py-1.5">{r.conn.installedOn || "—"}</td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_STYLE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                    {r.modem && <span className="ml-1 text-gray-500">· modem {r.modem.mac || ""}</span>}
                    {(r.reason || r.warnings.length > 0) && (
                      <p className="mt-0.5 text-gray-500">{[r.reason, ...r.warnings].filter(Boolean).join(" · ")}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="secondary" onClick={() => setStep("map")} disabled={busy}>Back</Button>
          <Button type="button" loading={busy} disabled={!chosen.length} onClick={doImport}>
            {busy ? `Importing ${progress[0]} / ${progress[1]}...` : `Import ${chosen.length} ${chosen.length === 1 ? "row" : "rows"}`}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Step 4: result ----
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">
        Imported <b>{result.connections}</b> connections and created <b>{result.customers}</b> new customers.
        {result.failed.length > 0 && <> <b className="text-red-700">{result.failed.length} rows failed.</b></>}
      </div>
      {result.failed.length > 0 && (
        <div className="space-y-2">
          <ul className="max-h-40 overflow-auto rounded-lg border border-gray-200 p-2 text-xs text-red-700">
            {result.failed.map((f) => (
              <li key={f.n}>Row {f.n}: {f.error}</li>
            ))}
          </ul>
          <button type="button" onClick={downloadFailed} className="text-sm font-medium text-indigo-600 hover:underline">
            Download the failed rows to fix and re-import
          </button>
          <p className="text-xs text-gray-400">Rows already saved are skipped on a re-import, so it's safe to run again.</p>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
