import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import CustomerForm from "../components/customers/CustomerForm";
import { emptyCustomerForm } from "../utils/customerForm";
import { StatusChip, ModemBadge, ReminderChip } from "../components/customers/Chips";
import { getCustomers, createCustomer } from "../services/customersService";
import { getProviders } from "../services/providersService";
import { getFtuSettings } from "../services/settingsService";
import { bulkSetConnectionStatus } from "../services/connectionsService";
import { bulkSetLineModem } from "../services/modemsService";
import { reminderFor } from "../utils/ftu";
import { formatDate } from "../utils/format";
import { CONNECTION_STATUS_LABELS, ROLES } from "../constants";
import { useAuth } from "../context/AuthContext";
import ImportModal from "../components/customers/ImportModal";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const MODEM_LABELS = { ftu: "FTU", own: "Own modem", none: "No modem" };
const MODEM_KIND = { ftu: "ftu", own: "customer", none: "none" }; // badge -> setLineModem kind

const fetchAll = () =>
  Promise.all([getCustomers(), getProviders({ includeInactive: true }), getFtuSettings()]);

export default function Customers() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;
  const [importOpen, setImportOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [providers, setProviders] = useState([]);
  const [settings, setSettings] = useState({ dueDays: 30, collectDays: 60 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modemFilter, setModemFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const [selected, setSelected] = useState(() => new Set());
  const [bulkModem, setBulkModem] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAsk, setBulkAsk] = useState(null); // { type, value, lineIds }
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyCustomerForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const apply = ([c, p, s]) => {
    setCustomers(c);
    setProviders(p);
    setSettings(s);
    setError("");
  };
  const refresh = () =>
    fetchAll()
      .then(apply)
      .catch((e) => setError(e.message));

  useEffect(() => {
    let alive = true;
    fetchAll()
      .then((d) => alive && apply(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // The lines that count: all of them, or only the chosen provider's.
  const linesOf = (c) =>
    providerFilter === "all"
      ? c.connections
      : c.connections.filter((l) => l.provider_id === providerFilter);

  const q = search.trim().toLowerCase();
  const matchesSearch = (c) => {
    if (!q) return true;
    const hay = [
      c.name, c.phone, c.alt_phone, c.email, c.address,
      ...c.connections.flatMap((l) => [l.username, l.details?.landline_no, l.details?.account_no]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  };

  const filtered = customers.filter((c) => {
    const lines = linesOf(c);
    if (providerFilter !== "all" && !lines.length) return false;
    if (statusFilter !== "all" && !lines.some((l) => l.status === statusFilter)) return false;
    if (modemFilter !== "all" && !lines.some((l) => l.badge === modemFilter)) return false;
    return matchesSearch(c);
  });

  // Counts over the lines in view (provider filter applies).
  const allLines = customers.flatMap(linesOf);
  const count = (fn) => allLines.filter(fn).length;

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allTicked = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allTicked ? new Set() : new Set(filtered.map((c) => c.id)));

  const selectedLineIds = customers
    .filter((c) => selected.has(c.id))
    .flatMap((c) => linesOf(c).map((l) => l.id));

  const askBulk = (type, value) => {
    setBulkMsg("");
    setBulkAsk({ type, value, lineIds: selectedLineIds });
  };

  const runBulk = async () => {
    setBulkBusy(true);
    try {
      if (bulkAsk.type === "status") {
        await bulkSetConnectionStatus(bulkAsk.lineIds, bulkAsk.value);
        setBulkMsg(`Status updated on ${bulkAsk.lineIds.length} connections.`);
      } else {
        const r = await bulkSetLineModem(bulkAsk.lineIds, MODEM_KIND[bulkAsk.value]);
        setBulkMsg(
          `Modem set on ${r.done} connections.` +
            (r.failed.length ? ` ${r.failed.length} skipped: ${r.failed[0].error}` : "")
        );
      }
      setBulkAsk(null);
      setBulkModem("");
      setBulkStatus("");
      setSelected(new Set());
      await refresh();
    } catch (e) {
      setBulkMsg(e.message);
      setBulkAsk(null);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const c = await createCustomer(form);
      setAddOpen(false);
      navigate(`/customers/${c.id}`); // add their connections next
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pill = (text, cls = "bg-gray-100 text-gray-700") => (
    <span key={text} className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {text}
    </span>
  );

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Internet customers, their connections and modems"
        action={
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                Import
              </Button>
            )}
            <Button
              onClick={() => {
                setForm(emptyCustomerForm);
                setFormError("");
                setAddOpen(true);
              }}
            >
              + Add Customer
            </Button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Counts for the lines in view */}
      <div className="mb-4 flex flex-wrap gap-2">
        {pill(`${customers.length} customers · ${allLines.length} connections`, "bg-indigo-50 text-indigo-700")}
        {pill(`Active ${count((l) => l.status === "active")}`, "bg-green-100 text-green-700")}
        {pill(`Inactive ${count((l) => l.status === "inactive")}`, "bg-amber-100 text-amber-700")}
        {pill(`Disconnected ${count((l) => l.status === "disconnected")}`, "bg-red-100 text-red-700")}
        {pill(`FTU ${count((l) => l.badge === "ftu")}`, "bg-emerald-100 text-emerald-700")}
        {pill(`Own ${count((l) => l.badge === "own")}`, "bg-blue-100 text-blue-700")}
        {pill(`No modem ${count((l) => l.badge === "none")}`)}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          className={inputClass + " sm:col-span-1"}
          placeholder="Search name, phone, username, landline, account..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputClass} value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Any status</option>
          {Object.entries(CONNECTION_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className={inputClass} value={modemFilter} onChange={(e) => setModemFilter(e.target.value)}>
          <option value="all">Any modem</option>
          {Object.entries(MODEM_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Bulk actions for ticked customers */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
          <span className="font-medium text-indigo-800">
            {selected.size} selected · {selectedLineIds.length} connections
            {providerFilter !== "all" ? " (filtered provider)" : ""}
          </span>
          <select className="rounded-lg border border-gray-300 px-2 py-1" value={bulkModem}
            onChange={(e) => { setBulkModem(e.target.value); if (e.target.value) askBulk("modem", e.target.value); }}>
            <option value="">Set modem…</option>
            <option value="ftu">FTU (ours)</option>
            <option value="own">Own modem</option>
            <option value="none">None</option>
          </select>
          <select className="rounded-lg border border-gray-300 px-2 py-1" value={bulkStatus}
            onChange={(e) => { setBulkStatus(e.target.value); if (e.target.value) askBulk("status", e.target.value); }}>
            <option value="">Set status…</option>
            {Object.entries(CONNECTION_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button type="button" className="ml-auto text-xs text-indigo-700 hover:underline" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
      {bulkMsg && <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{bulkMsg}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-400">Loading customers...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            {customers.length === 0 ? 'No customers yet. Click "Add Customer" to create one.' : "No customers match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Connections</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="cursor-pointer align-top hover:bg-gray-50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.phone || "No phone"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {linesOf(c).length === 0 ? (
                        <span className="text-xs text-gray-400">No connections</span>
                      ) : (
                        <div className="space-y-1.5">
                          {linesOf(c).map((l) => (
                            <div key={l.id} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-20 text-xs font-semibold text-gray-700">{l.provider?.name}</span>
                              <StatusChip status={l.status} />
                              <ModemBadge badge={l.badge} />
                              <ReminderChip reminder={reminderFor(l, l.modems, settings)} />
                              <span className="text-xs text-gray-400">
                                {l.last_recharge_on ? `Recharged ${formatDate(l.last_recharge_on)}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-indigo-600">View →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Customer">
        <form onSubmit={handleAdd} className="space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
          <CustomerForm form={form} onChange={handleChange} />
          <p className="text-xs text-gray-400">You can add their BSNL / TIC connections on the next screen.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{saving ? "Saving..." : "Save Customer"}</Button>
          </div>
        </form>
      </Modal>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        providers={providers.filter((p) => p.active)}
        onDone={refresh}
      />

      <ConfirmDialog
        open={!!bulkAsk}
        onClose={() => setBulkAsk(null)}
        onConfirm={runBulk}
        loading={bulkBusy}
        title={bulkAsk?.type === "status" ? "Set status" : "Set modem"}
        confirmLabel="Apply"
        message={
          bulkAsk
            ? bulkAsk.type === "status"
              ? `Set ${bulkAsk.lineIds.length} connections to "${CONNECTION_STATUS_LABELS[bulkAsk.value]}"?`
              : `Set the modem on ${bulkAsk.lineIds.length} connections to "${MODEM_LABELS[bulkAsk.value]}"? ` +
                (bulkAsk.value === "none"
                  ? "Only bare placeholders are removed; modems that came from stock are skipped."
                  : "A modem record is created where none exists.")
            : ""
        }
      />
    </div>
  );
}
