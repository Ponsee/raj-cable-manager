import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import WorkerForm, {
  DEFAULT_PRICING_FORM,
  buildPricing,
} from "../components/forms/WorkerForm";
import { getWorkersWithBalance, createWorker } from "../services/workersService";
import { WORKER_TYPES, WORK_TYPES, WORKER_TYPE_LABELS } from "../constants";
import { formatCurrency } from "../utils/format";

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
  ...DEFAULT_PRICING_FORM,
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
        pricing: buildPricing(form),
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
                  <th className="px-4 py-3 text-right">Balance Due</th>
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

          <WorkerForm form={form} onChange={handleChange} />

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
