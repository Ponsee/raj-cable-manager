import { useState } from "react";

export const fieldInputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

// Password-style input with a show / hide toggle.
export function SecretInput({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value ?? ""}
        onChange={onChange}
        className={fieldInputClass + " pr-14"}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:underline"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

// A provider's own fields (user name, password, VLAN ...), as grid cells.
// Put it inside a grid; `onChange(key, value)`.
export default function ProviderFieldInputs({ fields = [], values = {}, onChange, markRequired = true }) {
  return fields.map((f) => (
    <Field key={f.key} label={f.label} required={markRequired && f.required}>
      {f.type === "secret" || f.secret ? (
        <SecretInput value={values[f.key]} onChange={(e) => onChange(f.key, e.target.value)} />
      ) : (
        <input
          type={f.type === "number" || f.type === "date" ? f.type : "text"}
          value={values[f.key] ?? ""}
          onChange={(e) => onChange(f.key, e.target.value)}
          className={fieldInputClass}
        />
      )}
    </Field>
  ));
}
