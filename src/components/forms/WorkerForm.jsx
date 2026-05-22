import { WORKER_TYPES, WORK_TYPES } from "../../constants";
import { ordinal } from "../../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Shared worker fields, used by both "Add worker" and "Edit worker".
// Parent owns the state (`form`) and handles submit; this just renders inputs.
export default function WorkerForm({ form, onChange, showActive = false }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Name *
        </label>
        <input
          name="name"
          required
          value={form.name}
          onChange={onChange}
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
          onChange={onChange}
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
              onChange={onChange}
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
              onChange={onChange}
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
            onChange={onChange}
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
            onChange={onChange}
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
            onChange={onChange}
            className={inputClass}
            placeholder="Optional"
          />
        </div>
      </div>

      {showActive && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="is_active"
            checked={form.is_active}
            onChange={onChange}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active (uncheck to disable this worker)
        </label>
      )}
    </div>
  );
}
