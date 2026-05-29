import { WORKER_TYPES, WORK_TYPES } from "../../constants";
import { ordinal } from "../../utils/format";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Default pricing values shown in the form (match the global rates).
export const DEFAULT_PRICING_FORM = {
  splice_limit: "4",
  splice_low_rate: "100",
  splice_high_rate: "90",
  wire_rate: "3500",
};

// Turn the flat form fields into the `pricing` object we store on the worker.
// Returns null for employees and for "other" contract work (no fixed rate).
export function buildPricing(form) {
  if (form.type !== WORKER_TYPES.CONTRACT) return null;
  if (form.work_type === WORK_TYPES.SPLICING) {
    return {
      low_joint_limit: Number(form.splice_limit) || 4,
      low_rate: Number(form.splice_low_rate) || 100,
      high_rate: Number(form.splice_high_rate) || 90,
    };
  }
  if (form.work_type === WORK_TYPES.WIRE_LAYING) {
    return { rate_per_km: Number(form.wire_rate) || 3500 };
  }
  return null;
}

// Turn a stored `pricing` object back into flat form fields (for editing).
export function pricingToFormFields(pricing) {
  return {
    splice_limit:
      pricing?.low_joint_limit != null
        ? String(pricing.low_joint_limit)
        : DEFAULT_PRICING_FORM.splice_limit,
    splice_low_rate:
      pricing?.low_rate != null
        ? String(pricing.low_rate)
        : DEFAULT_PRICING_FORM.splice_low_rate,
    splice_high_rate:
      pricing?.high_rate != null
        ? String(pricing.high_rate)
        : DEFAULT_PRICING_FORM.splice_high_rate,
    wire_rate:
      pricing?.rate_per_km != null
        ? String(pricing.rate_per_km)
        : DEFAULT_PRICING_FORM.wire_rate,
  };
}

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
        <>
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

          {/* Pricing — changes with the chosen work type */}
          {form.work_type === WORK_TYPES.SPLICING && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-sm font-medium text-gray-700">
                Splicing pricing (₹ per joint)
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Joint limit
                  </label>
                  <input
                    name="splice_limit"
                    type="number"
                    min="1"
                    value={form.splice_limit}
                    onChange={onChange}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Up to limit (₹)
                  </label>
                  <input
                    name="splice_low_rate"
                    type="number"
                    min="0"
                    value={form.splice_low_rate}
                    onChange={onChange}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Above limit (₹)
                  </label>
                  <input
                    name="splice_high_rate"
                    type="number"
                    min="0"
                    value={form.splice_high_rate}
                    onChange={onChange}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Up to {form.splice_limit || 4} joints → ₹
                {form.splice_low_rate || 100}/joint. More than{" "}
                {form.splice_limit || 4} → ₹{form.splice_high_rate || 90}/joint.
              </p>
            </div>
          )}

          {form.work_type === WORK_TYPES.WIRE_LAYING && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Wire laying rate (₹ per km)
              </label>
              <input
                name="wire_rate"
                type="number"
                min="0"
                value={form.wire_rate}
                onChange={onChange}
                className={inputClass}
              />
            </div>
          )}

          {form.work_type === WORK_TYPES.OTHER && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              For "Other" work, you'll type the amount each time you add work.
            </p>
          )}
        </>
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
