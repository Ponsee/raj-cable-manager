const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

// Basic customer details (shared by Add + Edit).
export default function CustomerForm({ form, onChange }) {
  const input = (name, props = {}) => (
    <input name={name} value={form[name]} onChange={onChange} className={inputClass} {...props} />
  );
  return (
    <div className="space-y-4">
      <Field label="Name *">{input("name", { required: true, placeholder: "e.g. Arumugam" })}</Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone">{input("phone", { placeholder: "Mobile number" })}</Field>
        <Field label="Alternate phone">{input("alt_phone", { placeholder: "Optional" })}</Field>
      </div>
      <Field label="Email">{input("email", { type: "email", placeholder: "Optional" })}</Field>
      <Field label="Address">{input("address", { placeholder: "Optional" })}</Field>
      <Field label="Notes">{input("notes", { placeholder: "Optional" })}</Field>
    </div>
  );
}
