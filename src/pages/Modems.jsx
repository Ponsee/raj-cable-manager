import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import StatCard from "../components/ui/StatCard";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { StatusChip, ReminderChip, CopyButton } from "../components/customers/Chips";
import { AddModemModal, IssueModal, NoticeModal, LostModal, EditModemModal } from "../components/customers/ModemModals";
import { getModems, deleteModem } from "../services/modemsService";
import { returnUnitToStock } from "../services/modemFlowService";
import { SendToServiceModal, ServiceResultModal, ServiceDetailsModal } from "../components/customers/ServiceModals";
import { SERVICE_OUTCOME_LABELS } from "../utils/modemService";
import { getFtuSettings } from "../services/settingsService";
import { reminderFor, daysSince } from "../utils/ftu";
import { formatDate } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const VIEWS = {
  all: "All modems",
  in_stock: "In stock",
  with_customer: "With customer",
  due: "Due soon",
  collect: "Collect now",
  notset: "Recharge date not set",
  with_service: "With service",
  out: "Sold / used",
  lost: "Lost",
};

// Worst reminder first, so what needs action is at the top.
const SEVERITY = { collect_now: 4, collect: 3, due: 2, notset: 1 };

const fetchAll = () => Promise.all([getModems(), getFtuSettings()]);

export default function Modems() {
  const { role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;
  const location = useLocation();
  const [modems, setModems] = useState([]);
  const [settings, setSettings] = useState({ dueDays: 30, collectDays: 60 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The dashboard card opens this page already filtered (e.g. "collect").
  const [view, setView] = useState(VIEWS[location.state?.view] ? location.state.view : "all");
  const [ownership, setOwnership] = useState("all");
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [issue, setIssue] = useState(null);
  const [notice, setNotice] = useState(null);
  const [lost, setLost] = useState(null);
  const [edit, setEdit] = useState(null);
  const [sendModem, setSendModem] = useState(null); // faulty -> send to service
  const [resultModem, setResultModem] = useState(null); // the brand answered
  const [detailsModem, setDetailsModem] = useState(null);
  const [returnAsk, setReturnAsk] = useState(null);
  const [delAsk, setDelAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [askError, setAskError] = useState("");

  const apply = ([m, s]) => {
    setModems(m);
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

  // Reminder per unit (only for modems that are with a customer).
  const rows = modems.map((m) => ({
    ...m,
    reminder:
      m.status === "with_customer" && m.connection
        ? reminderFor(m.connection, [m], settings)
        : { level: "none", days: null },
  }));

  const count = (f) => rows.filter(f).length;
  const level = (r) => r.reminder.level;

  const matchesView = (r) => {
    switch (view) {
      case "in_stock": return r.status === "in_stock";
      case "with_customer": return r.status === "with_customer";
      case "with_service": return r.status === "with_service";
      case "out": return r.status === "out";
      case "lost": return r.status === "lost";
      case "due": return level(r) === "due";
      case "collect": return level(r) === "collect" || level(r) === "collect_now";
      case "notset": return level(r) === "notset";
      default: return true;
    }
  };

  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => matchesView(r) && (ownership === "all" || r.ownership === ownership))
    .filter((r) => {
      if (!q) return true;
      const hay = [
        r.mac_address, r.serial_no, r.product?.name,
        r.connection?.customer?.name, r.connection?.customer?.phone, r.connection?.provider?.name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (SEVERITY[level(b)] || 0) - (SEVERITY[level(a)] || 0));

  const run = async (fn, close) => {
    setBusy(true);
    setAskError("");
    try {
      await fn();
      close();
      await refresh();
    } catch (e) {
      setAskError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cards = [
    { key: "in_stock", label: "In stock", icon: "📦", accent: "blue", n: count((r) => r.status === "in_stock") },
    { key: "with_customer", label: "With customer", icon: "🏠", accent: "green", n: count((r) => r.status === "with_customer") },
    { key: "due", label: "Due soon", icon: "⏰", accent: "amber", n: count((r) => level(r) === "due") },
    { key: "collect", label: "Collect now", icon: "🚨", accent: "red", n: count((r) => level(r) === "collect" || level(r) === "collect_now") },
    { key: "notset", label: "Not set", icon: "❔", accent: "purple", n: count((r) => level(r) === "notset") },
    { key: "with_service", label: "With service", icon: "🔧", accent: "orange", n: count((r) => r.status === "with_service") },
  ];

  return (
    <div>
      <PageHeader
        title="Modems"
        subtitle={`FTU reminders: due soon after ${settings.dueDays} days, collect after ${settings.collectDays} days without a recharge`}
        action={<Button onClick={() => setAddOpen(true)}>+ Add modem</Button>}
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <StatCard key={c.key} label={c.label} value={c.n} icon={c.icon} accent={c.accent}
            onClick={() => setView(view === c.key ? "all" : c.key)} />
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input className={inputClass + " sm:col-span-2"} placeholder="Search MAC, serial, customer, phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputClass} value={view} onChange={(e) => setView(e.target.value)}>
          {Object.entries(VIEWS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className={inputClass} value={ownership} onChange={(e) => setOwnership(e.target.value)}>
          <option value="all">FTU and customer-owned</option>
          <option value="ftu">FTU (ours)</option>
          <option value="customer">Customer-owned</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-400">Loading modems...</p>
        ) : shown.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            {modems.length === 0
              ? 'No modems yet. Set a customer\'s modem on their page, or click "Add modem".'
              : "No modems match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Modem</th>
                  <th className="px-4 py-3">Customer / line</th>
                  <th className="px-4 py-3">Last recharge</th>
                  <th className="px-4 py-3">Reminder</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((r) => {
                  const cust = r.connection?.customer;
                  const ftu = r.ownership === "ftu";
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-2 font-mono text-xs">
                          {r.mac_address || <span className="font-sans text-gray-400">No MAC</span>}
                          <CopyButton value={r.mac_address} />
                        </p>
                        <p className="text-xs text-gray-500">
                          {[r.product?.name, r.serial_no && `S/N ${r.serial_no}`].filter(Boolean).join(" · ") || "No product / serial"}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${ftu ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                            {ftu ? "FTU" : "Customer's"}
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                            {VIEWS[r.status] || r.status}
                          </span>
                          {r.service?.outcome && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
                              {SERVICE_OUTCOME_LABELS[r.service.outcome]}
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "with_service" && r.service ? (
                          <>
                            {r.service.for_customer_id ? (
                              <Link to={`/customers/${r.service.for_customer_id}`} className="font-medium text-indigo-700 hover:underline">
                                {r.service.customer_name}
                              </Link>
                            ) : (
                              <span className="font-medium">{r.service.customer_name}</span>
                            )}
                            <p className="text-xs text-gray-500">{r.service.provider_name}</p>
                            <p className="mt-1 text-xs text-orange-700">
                              With {r.service.brand}
                              {r.service.claim_no ? ` · claim ${r.service.claim_no}` : ""} · {daysSince(r.service.sent_on)} days
                            </p>
                          </>
                        ) : cust ? (
                          <>
                            <Link to={`/customers/${cust.id}`} className="font-medium text-indigo-700 hover:underline">{cust.name}</Link>
                            <p className="text-xs text-gray-500">{cust.phone || "No phone"}</p>
                            <p className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                              {r.connection.provider?.name} <StatusChip status={r.connection.status} />
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Not with a customer</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {r.connection?.last_recharge_on ? (
                          <>
                            {formatDate(r.connection.last_recharge_on)}
                            {r.reminder.days != null && <span className="text-gray-400"> ({r.reminder.days} days)</span>}
                          </>
                        ) : r.connection ? (
                          <span className="text-gray-400">Not set</span>
                        ) : ("—")}
                        {r.notice_sent_on && <p className="mt-1 text-amber-700">Notice sent {formatDate(r.notice_sent_on)}</p>}
                      </td>
                      <td className="px-4 py-3"><ReminderChip reminder={r.reminder} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {r.status === "in_stock" && (
                            <>
                              <Button onClick={() => setIssue(r)}>Issue</Button>
                              {/* Units that belong to a stock product are removed via "Report loss" so stock stays right */}
                              {isAdmin && !r.product_id && <Button variant="secondary" onClick={() => { setAskError(""); setDelAsk(r); }}>Delete</Button>}
                            </>
                          )}
                          {r.status === "with_customer" && ftu && (
                            <>
                              <Button variant="secondary" onClick={() => setNotice(r)}>Notice</Button>
                              <Button onClick={() => { setAskError(""); setReturnAsk(r); }}>Returned</Button>
                            </>
                          )}
                          {r.status === "with_customer" && (
                            <Button variant="secondary" onClick={() => setSendModem(r)}>Faulty</Button>
                          )}
                          {r.status === "with_service" && !r.service?.outcome && (
                            <Button onClick={() => setResultModem(r)}>Result</Button>
                          )}
                          {r.service && r.status !== "in_stock" && (
                            <Button variant="secondary" onClick={() => setDetailsModem(r)}>Details</Button>
                          )}
                          {(r.status === "with_customer" || r.status === "with_service") && (
                            <Button variant="secondary" onClick={() => setLost(r)}>Lost</Button>
                          )}
                          {r.status !== "lost" && (
                            <Button variant="secondary" onClick={() => setEdit(r)}>Edit</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddModemModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={refresh} />
      <IssueModal open={!!issue} onClose={() => setIssue(null)} modem={issue} onSaved={refresh} />
      <NoticeModal open={!!notice} onClose={() => setNotice(null)} modem={notice} onSaved={refresh} />
      <LostModal open={!!lost} onClose={() => setLost(null)} modem={lost} onSaved={refresh} />
      <SendToServiceModal open={!!sendModem} onClose={() => setSendModem(null)} modem={sendModem} modems={modems} onSaved={refresh} />
      <ServiceResultModal open={!!resultModem} onClose={() => setResultModem(null)} modem={resultModem} modems={modems} onSaved={refresh} />
      <ServiceDetailsModal open={!!detailsModem} onClose={() => setDetailsModem(null)} modem={detailsModem} isAdmin={isAdmin} onSaved={refresh} />
      <EditModemModal open={!!edit} onClose={() => setEdit(null)} modem={edit} onSaved={refresh} />

      <ConfirmDialog
        open={!!returnAsk}
        onClose={() => setReturnAsk(null)}
        onConfirm={() => run(() => returnUnitToStock(returnAsk), () => setReturnAsk(null))}
        loading={busy}
        error={askError}
        title="Modem collected?"
        confirmLabel="Mark returned"
        message={`The modem goes back to stock and is taken off ${returnAsk?.connection?.customer?.name || "the customer"}'s ${returnAsk?.connection?.provider?.name || ""} line.`}
      />
      <ConfirmDialog
        open={!!delAsk}
        onClose={() => setDelAsk(null)}
        onConfirm={() => run(() => deleteModem(delAsk.id), () => setDelAsk(null))}
        loading={busy}
        error={askError}
        title="Delete this modem?"
        message="Removes this unit from the list. This cannot be undone."
      />
    </div>
  );
}
