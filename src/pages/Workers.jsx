import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { getWorkersWithBalance, createWorker } from "../services/workersService";
import { WORKER_TYPES, WORK_TYPES, WORKER_TYPE_LABELS } from "../constants";
import { formatCurrency, ordinal } from "../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const emptyForm = {
  name: "",
  type: WORKER_TYPES.SALARY,
  work_type: WORK_TYPES.OTHER,
  monthly_salary: "",
  salary_pay_day: "1",
  phone: "",
  address: "",
};

export default function Workers() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setWorkers(await getWorkersWithBalance());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await createWorker({
        name: form.name.trim(),
        type: form.type,
        work_type: form.type === WORKER_TYPES.CONTRACT ? form.work_type : null,
        monthly_salary:
          form.type === WORKER_TYPES.SALARY
            ? Number(form.monthly_salary) || 0
            : 0,
        salary_pay_day:
          form.type === WORKER_TYPES.SALARY
            ? Number(form.salary_pay_day) || null
            : null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      setModalOpen(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Apply search + type filter.
  const filtered = workers.filter((w) => {
    const matchesType = typeFilter === "all" || w.type === typeFilter;
    const matchesSearch = w.name
      ?.toLowerCase()
      .includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div>
      <PageHeader
        title="Workers"
        subtitle="Salary & contract workers"
        action={
          <Button onClick={() => setModalOpen(true)}>+ Add Worker</Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          className={inputClass + " sm:max-w-xs"}
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={inputClass + " sm:w-44"}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          <option value={WORKER_TYPES.SALARY}>Employees</option>
          <option value={WORKER_TYPES.CONTRACT}>Contract workers</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-400">Loading workers...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-gray-400">
            No workers yet. Click "Add Worker" to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Work</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((w) => (
                  <tr
                    key={w.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/workers/${w.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {w.name}
                      {!w.is_active && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {WORKER_TYPE_LABELS[w.type] || w.type}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">
                      {w.work_type?.replace("_", " ") || "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        w.balance > 0
                          ? "text-amber-600"
                          : w.balance < 0
                          ? "text-red-600"
                          : "text-gray-500"
                      }`}
                    >
                      {formatCurrency(w.balance)}
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

      {/* Add Worker modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Worker"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              name="name"
              required
              value={form.name}
              onChange={handleChange}
              className={inputClass}
              placeholder="Worker name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Type *
            </label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className={inputClass}
            >
              <option value={WORKER_TYPES.SALARY}>Employee</option>
              <option value={WORKER_TYPES.CONTRACT}>Contract worker</option>
            </select>
          </div>

          {form.type === WORKER_TYPES.SALARY ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Monthly salary (₹)
                </label>
                <input
                  name="monthly_salary"
                  type="number"
                  min="0"
                  value={form.monthly_salary}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="20000"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Salary pay day
                </label>
                <select
                  name="salary_pay_day"
                  value={form.salary_pay_day}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {ordinal(d)} of month
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Main work type
              </label>
              <select
                name="work_type"
                value={form.work_type}
                onChange={handleChange}
                className={inputClass}
              >
                <option value={WORK_TYPES.SPLICING}>Splicing</option>
                <option value={WORK_TYPES.WIRE_LAYING}>Wire laying</option>
                <option value={WORK_TYPES.OTHER}>Other</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                name="address"
                value={form.address}
                onChange={handleChange}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Worker"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
