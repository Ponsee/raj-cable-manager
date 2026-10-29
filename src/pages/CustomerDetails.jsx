import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import CustomerForm from "../components/customers/CustomerForm";
import { customerToForm } from "../utils/customerForm";
import ConnectionModal from "../components/customers/ConnectionModal";
import RechargedModal from "../components/customers/RechargedModal";
import { StatusChip, ModemBadge, ReminderChip, SecretText, CopyButton } from "../components/customers/Chips";
import { getCustomer, updateCustomer, deleteCustomer } from "../services/customersService";
import { getProviders } from "../services/providersService";
import { getFtuSettings } from "../services/settingsService";
import { setConnectionStatus, deleteConnection } from "../services/connectionsService";
import { markReturned } from "../services/modemsService";
import { reminderFor, modemOnLine, joinFieldValues, daysSince } from "../utils/ftu";
import { formatCurrency, formatDate } from "../utils/format";
import { CONNECTION_STATUS_LABELS } from "../constants";

const fetchAll = (id) =>
  Promise.all([getCustomer(id), getProviders(), getFtuSettings()]);

const prettyKey = (k) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Fact({ label, children }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-400">{label}</p>
      <div className="text-sm text-gray-800">{children || "—"}</div>
    </div>
  );
}

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [providers, setProviders] = useState([]);
  const [settings, setSettings] = useState({ dueDays: 30, collectDays: 60 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");

  const [connModal, setConnModal] = useState({ open: false, connection: null });
  const [recharge, setRecharge] = useState(null); // connection being marked recharged
  const [delConn, setDelConn] = useState(null);
  const [delConnError, setDelConnError] = useState("");
  const [returnAsk, setReturnAsk] = useState(null); // line that went inactive/disconnected with an FTU modem
  const [busy, setBusy] = useState(false);

  const apply = ([c, p, s]) => {
    setCustomer(c);
    setProviders(p);
    setSettings(s);
    setError("");
  };
  const refresh = () =>
    fetchAll(id)
      .then(apply)
      .catch((e) => setError(e.message));

  useEffect(() => {
    let alive = true;
    fetchAll(id)
      .then((d) => alive && apply(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const changeStatus = async (conn, status) => {
    setError("");
    try {
      await setConnectionStatus(conn.id, status);
      await refresh();
      const modem = modemOnLine(conn.modems);
      if (status !== "active" && modem?.ownership === "ftu") setReturnAsk({ conn, modem, status });
    } catch (e) {
      setError(e.message);
    }
  };

  const doReturn = async () => {
    setBusy(true);
    try {
      await markReturned(returnAsk.modem.id);
      setReturnAsk(null);
      await refresh();
    } catch (e) {
      setError(e.message);
      setReturnAsk(null);
    } finally {
      setBusy(false);
    }
  };

  const saveCustomer = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await updateCustomer(id, form);
      setEditOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const doDeleteCustomer = async () => {
    setDeleting(true);
    setDelError("");
    try {
      await deleteCustomer(id);
      navigate("/customers");
    } catch (err) {
      setDelError(err.message);
      setDeleting(false);
    }
  };

  const doDeleteConn = async () => {
    setDeleting(true);
    setDelConnError("");
    try {
      await deleteConnection(delConn.id);
      setDelConn(null);
      await refresh();
    } catch (err) {
      setDelConnError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p className="p-8 text-center text-gray-400">Loading customer...</p>;
  if (!customer)
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">{error || "Customer not found."}</p>
        <Link to="/customers" className="text-indigo-600 hover:underline">← Back to customers</Link>
      </div>
    );

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.connections.length} connection${customer.connections.length === 1 ? "" : "s"}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setForm(customerToForm(customer));
                setFormError("");
                setEditOpen(true);
              }}
            >
              Edit
            </Button>
            <Button variant="danger" onClick={() => { setDelError(""); setDelOpen(true); }}>
              Delete
            </Button>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Basic details */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Status"><StatusChip status={customer.status} /></Fact>
          <Fact label="Phone">{customer.phone}</Fact>
          <Fact label="Alternate phone">{customer.alt_phone}</Fact>
          <Fact label="Email">{customer.email}</Fact>
          <div className="col-span-2"><Fact label="Address">{customer.address}</Fact></div>
          <div className="col-span-2"><Fact label="Notes">{customer.notes}</Fact></div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Connections</h3>
        <Button onClick={() => setConnModal({ open: true, connection: null })}>+ Add connection</Button>
      </div>

      {customer.connections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          No connections yet. Add their BSNL or TIC line.
        </p>
      ) : (
        <div className="space-y-4">
          {customer.connections.map((conn) => {
            const fields = conn.provider?.fields || [];
            const vals = joinFieldValues(fields, conn);
            const known = new Set(fields.map((f) => f.key));
            const extraKeys = Object.keys(conn.details || {}).filter((k) => !known.has(k));
            const modem = modemOnLine(conn.modems);
            const reminder = reminderFor(conn, conn.modems, settings);
            const ago = daysSince(conn.last_recharge_on);
            return (
              <div key={conn.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-gray-900">{conn.provider?.name}</h4>
                  <StatusChip status={conn.status} />
                  <ModemBadge badge={conn.badge} />
                  <ReminderChip reminder={reminder} />
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <select
                      value={conn.status}
                      onChange={(e) => changeStatus(conn, e.target.value)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      aria-label="Connection status"
                    >
                      {Object.entries(CONNECTION_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <Button onClick={() => setRecharge(conn)}>Recharged</Button>
                    <Button variant="secondary" onClick={() => setConnModal({ open: true, connection: conn })}>Edit</Button>
                    <Button variant="danger" onClick={() => { setDelConnError(""); setDelConn(conn); }}>Delete</Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Plan">
                    {[conn.plan_name, conn.plan_amount ? formatCurrency(conn.plan_amount) : null].filter(Boolean).join(" · ")}
                  </Fact>
                  <Fact label="Installed">{conn.installed_on ? formatDate(conn.installed_on) : ""}</Fact>
                  <Fact label="Last recharge">
                    {conn.last_recharge_on ? (
                      <>
                        {formatDate(conn.last_recharge_on)}
                        <span className="ml-1 text-xs text-gray-400">({ago} days ago)</span>
                      </>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </Fact>
                  <Fact label="User name">
                    {conn.username && (
                      <span className="inline-flex items-center gap-2 break-all">
                        {conn.username} <CopyButton value={conn.username} />
                      </span>
                    )}
                  </Fact>
                  {fields
                    .filter((f) => !f.column || f.column === "password")
                    .map((f) => {
                      const v = vals[f.key];
                      if (!v) return null;
                      return (
                        <Fact key={f.key} label={f.label}>
                          {f.secret || f.type === "secret" ? <SecretText value={v} /> : v}
                        </Fact>
                      );
                    })}
                  {extraKeys.map((k) => (
                    <Fact key={k} label={`${prettyKey(k)} (this connection)`}>{String(conn.details[k])}</Fact>
                  ))}
                </div>

                {/* The modem on this line */}
                <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  {modem ? (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      <span className="font-medium text-gray-700">Modem</span>
                      <span>
                        MAC:{" "}
                        {modem.mac_address ? (
                          <span className="inline-flex items-center gap-2 font-mono">
                            {modem.mac_address} <CopyButton value={modem.mac_address} />
                          </span>
                        ) : (
                          <span className="text-gray-400">not recorded</span>
                        )}
                      </span>
                      <span>Serial: {modem.serial_no || <span className="text-gray-400">not recorded</span>}</span>
                      {modem.issued_on && <span className="text-gray-500">Given {formatDate(modem.issued_on)}</span>}
                      {modem.notice_sent_on && <span className="text-amber-700">Notice sent {formatDate(modem.notice_sent_on)}</span>}
                    </div>
                  ) : (
                    <span className="text-gray-400">No modem recorded on this connection. Use Edit to set FTU / Own.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit customer */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer">
        {form && (
          <form onSubmit={saveCustomer} className="space-y-4">
            {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
            <CustomerForm form={form} onChange={(e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" loading={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConnectionModal
        open={connModal.open}
        onClose={() => setConnModal({ open: false, connection: null })}
        customerId={customer.id}
        connection={connModal.connection}
        providers={providers}
        onProviderUpdated={(p) => {
          setProviders((list) => list.map((x) => (x.id === p.id ? p : x)));
          refresh();
        }}
        onSaved={refresh}
      />

      <RechargedModal open={!!recharge} onClose={() => setRecharge(null)} connection={recharge} onSaved={refresh} />

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={doDeleteCustomer}
        loading={deleting}
        error={delError}
        title="Delete customer?"
        message={`This deletes ${customer.name} and all their connections. Past income entries are kept. This cannot be undone.`}
      />

      <ConfirmDialog
        open={!!delConn}
        onClose={() => setDelConn(null)}
        onConfirm={doDeleteConn}
        loading={deleting}
        error={delConnError}
        title="Delete connection?"
        message={`Delete the ${delConn?.provider?.name} connection${delConn?.username ? ` (${delConn.username})` : ""}? Past income entries are kept. This cannot be undone.`}
      />

      <ConfirmDialog
        open={!!returnAsk}
        onClose={() => setReturnAsk(null)}
        onConfirm={doReturn}
        loading={busy}
        title="FTU modem still with the customer"
        confirmLabel="Mark returned"
        message={`The ${returnAsk?.conn.provider?.name} line${returnAsk?.conn.username ? ` (${returnAsk.conn.username})` : ""} is now ${returnAsk ? CONNECTION_STATUS_LABELS[returnAsk.status] : ""}. Has the FTU modem been collected? "Mark returned" puts it back in stock; choose Cancel to collect it later.`}
      />
    </div>
  );
}
