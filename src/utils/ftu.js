// Pure helpers for customers / connections / modems (no Supabase calls, so they
// are easy to test): MAC handling, customer matching, derived statuses, the
// "collect modem" reminder, and mapping a provider's form fields to a connection.
import {
  CONNECTION_STATUS,
  MODEM_OWNERSHIP,
  MODEM_STATUS,
  FTU_DEFAULT_DUE_DAYS,
  FTU_DEFAULT_COLLECT_DAYS,
} from "../constants";

// ---- MAC address ----
// "" for empty, "AA:BB:CC:DD:EE:FF" for a valid one (accepts : - . or no
// separators, any case), null when it isn't a valid MAC.
export function normalizeMac(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (/[^0-9a-f:.\-\s]/i.test(raw)) return null;
  const hex = raw.replace(/[:.\-\s]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(":");
}

// ---- Customer matching (import / New Internet) ----
const normName = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const phoneDigits = (s) => String(s ?? "").replace(/\D/g, "").slice(-10);

// A customer matches when the name matches AND the phone matches. Phone is not
// unique in real data (one mobile on several names), so phone alone never
// matches. If either side has no phone, fall back to name + address.
export function findMatchingCustomer(customers, { name, phone, address }) {
  const n = normName(name);
  if (!n) return null;
  const p = phoneDigits(phone);
  const a = normName(address);
  return (
    customers.find((c) => {
      if (normName(c.name) !== n) return false;
      const cp = phoneDigits(c.phone);
      if (p && cp) return p === cp;
      return !!a && normName(c.address) === a;
    }) || null
  );
}

// ---- Dates ----
export const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// Whole days from `from` ("YYYY-MM-DD") to `to` (default today); null if no date.
export function daysSince(from, to = todayISO()) {
  if (!from) return null;
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// ---- Statuses ----
// A customer's overall status is derived from their lines, never stored.
export function deriveCustomerStatus(connections = []) {
  if (!connections.length) return "none";
  const has = (s) => connections.some((c) => c.status === s);
  if (has(CONNECTION_STATUS.ACTIVE)) return CONNECTION_STATUS.ACTIVE;
  if (has(CONNECTION_STATUS.INACTIVE)) return CONNECTION_STATUS.INACTIVE;
  return CONNECTION_STATUS.DISCONNECTED;
}

// The modem currently on a line (one per line), or null.
export const modemOnLine = (modems = []) =>
  modems.find((m) => m.status === MODEM_STATUS.WITH_CUSTOMER) || null;

// "ftu" | "own" | "none" for the badge on a line.
export function modemBadge(modems = []) {
  const m = modemOnLine(modems);
  if (!m) return "none";
  return m.ownership === MODEM_OWNERSHIP.FTU ? "ftu" : "own";
}

// ---- Collect-modem reminder (per line) ----
// level: "none" (not an FTU modem) | "notset" | "ok" | "due" | "collect" |
// "collect_now" (FTU modem on an inactive / disconnected line).
export function reminderFor(connection, modems, opts = {}) {
  const {
    dueDays = FTU_DEFAULT_DUE_DAYS,
    collectDays = FTU_DEFAULT_COLLECT_DAYS,
    today = todayISO(),
  } = opts;
  const modem = modemOnLine(modems);
  if (!modem || modem.ownership !== MODEM_OWNERSHIP.FTU)
    return { level: "none", days: null };
  if (connection.status !== CONNECTION_STATUS.ACTIVE)
    return { level: "collect_now", days: daysSince(connection.last_recharge_on, today) };
  const days = daysSince(connection.last_recharge_on, today);
  if (days === null) return { level: "notset", days: null };
  if (days > collectDays) return { level: "collect", days };
  if (days > dueDays) return { level: "due", days };
  return { level: "ok", days };
}

// ---- Provider form fields <-> connection ----
// A field with `column` fills a real connections column; every other field's
// value lives in connections.details under its key.
const COLUMN_KEYS = ["username", "password", "plan_name"];

export function slugifyKey(label) {
  return String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Prefilled values for a new connection (e.g. BSNL password = "password").
export function providerDefaults(fields = []) {
  const out = {};
  for (const f of fields) if (f.default !== undefined) out[f.key] = f.default;
  return out;
}

// values { key: value } -> { username, password, plan_name, details }
export function splitFieldValues(fields = [], values = {}) {
  const out = { details: {} };
  for (const f of fields) {
    const raw = values[f.key];
    const v = typeof raw === "string" ? raw.trim() : raw;
    if (f.column && COLUMN_KEYS.includes(f.column)) out[f.column] = v === "" ? null : v ?? null;
    else if (v !== undefined && v !== "" && v !== null) out.details[f.key] = v;
  }
  // Values saved under fields that were later removed from the provider stay.
  for (const [k, v] of Object.entries(values)) {
    if (!fields.some((f) => f.key === k) && v !== "" && v != null && !COLUMN_KEYS.includes(k))
      out.details[k] = v;
  }
  return out;
}

// connection row -> { key: value } for the edit form
export function joinFieldValues(fields = [], connection = {}) {
  const out = { ...(connection.details || {}) };
  for (const f of fields) {
    if (f.column && COLUMN_KEYS.includes(f.column)) out[f.key] = connection[f.column] ?? "";
  }
  return out;
}
