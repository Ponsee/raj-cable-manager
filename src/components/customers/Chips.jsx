import { useState } from "react";
import { CONNECTION_STATUS_LABELS } from "../../constants";

const STATUS_STYLE = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-amber-100 text-amber-700",
  disconnected: "bg-red-100 text-red-700",
  none: "bg-gray-100 text-gray-500",
};
const STATUS_ICON = { active: "🟢", inactive: "🟡", disconnected: "🔴", none: "⚪" };

const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

// 🟢 Active · 🟡 Inactive · 🔴 Disconnected (status is per connection)
export function StatusChip({ status }) {
  const s = STATUS_STYLE[status] ? status : "none";
  return (
    <span className={`${chip} ${STATUS_STYLE[s]}`}>
      {STATUS_ICON[s]} {CONNECTION_STATUS_LABELS[s] || "No line"}
    </span>
  );
}

const BADGES = {
  ftu: { label: "FTU", cls: "bg-emerald-100 text-emerald-700", icon: "🟢" },
  own: { label: "Own modem", cls: "bg-blue-100 text-blue-700", icon: "🔵" },
  none: { label: "No modem", cls: "bg-gray-100 text-gray-500", icon: "⚪" },
};
export function ModemBadge({ badge = "none" }) {
  const b = BADGES[badge] || BADGES.none;
  return (
    <span className={`${chip} ${b.cls}`}>
      {b.icon} {b.label}
    </span>
  );
}

const REMINDERS = {
  due: { cls: "bg-amber-100 text-amber-700", text: (d) => `Due soon · ${d} days` },
  collect: { cls: "bg-red-100 text-red-700", text: (d) => `Collect modem · ${d} days` },
  collect_now: { cls: "bg-red-100 text-red-700", text: () => "Collect modem now" },
  notset: { cls: "bg-gray-100 text-gray-500", text: () => "Recharge date not set" },
};
// Only FTU modems get a reminder; "ok" / "none" show nothing.
export function ReminderChip({ reminder }) {
  const r = reminder && REMINDERS[reminder.level];
  if (!r) return null;
  return <span className={`${chip} ${r.cls}`}>{r.text(reminder.days)}</span>;
}

export function CopyButton({ value, label = "Copy" }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      title={label}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(value));
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked: ignore */
        }
      }}
      className="text-xs text-indigo-600 hover:underline"
    >
      {done ? "Copied" : label}
    </button>
  );
}

// Password / Aadhaar etc.: masked with a show / hide eye (visible to all approved users).
export function SecretText({ value }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm">{show ? value : "••••••••"}</span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="text-xs text-indigo-600 hover:underline"
      >
        {show ? "Hide" : "Show"}
      </button>
      {show && <CopyButton value={value} />}
    </span>
  );
}
