const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export const emptyVendorForm = { name: "", phone: "", address: "", note: "" };

// Shared vendor fields for Add + Edit.
export default function VendorForm({ form, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Vendor name *
        </label>
        <input
          name="name"
          required
          value={form.name}
          onChange={onChange}
          className={inputClass}
          placeholder="e.g. Ramesh Traders"
        />
      </div>
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
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Note
        </label>
        <input
          name="note"
          value={form.note}
          onChange={onChange}
          className={inputClass}
          placeholder="e.g. gives best price on fiber"
        />
      </div>
    </div>
  );
}
