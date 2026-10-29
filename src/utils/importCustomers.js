// Pure helpers for importing customers + connections from a sheet (no file or
// Supabase calls): header matching, cleaning messy values, and classifying each
// row as new / existing customer / duplicate / error. Used by the Import wizard.
import { findMatchingCustomer, normalizeMac, splitFieldValues } from "./ftu";
import { CONNECTION_STATUS } from "../constants";

// ---- Targets a sheet column can be mapped to ----
const BASE_TARGETS = [
  { id: "name", label: "Customer name" },
  { id: "phone", label: "Phone" },
  { id: "alt_phone", label: "Alternate phone" },
  { id: "email", label: "Email" },
  { id: "address", label: "Address" },
  { id: "installed_on", label: "Install date" },
  { id: "plan_amount", label: "Plan amount" },
  { id: "last_recharge_on", label: "Last recharge date" },
  { id: "status", label: "Status" },
  { id: "modem", label: "Modem (FTU / Own / None)" },
  { id: "mac_address", label: "Modem MAC address" },
  { id: "serial_no", label: "Modem serial" },
];

// Base targets + the provider's own fields (user name, password, VLAN ...).
export function buildTargets(provider) {
  return [
    ...BASE_TARGETS,
    ...(provider?.fields || []).map((f) => ({ id: `f:${f.key}`, label: f.label })),
  ];
}

// "VoIP Password (voice password)" -> "voip password"
export const normHeader = (h) =>
  String(h ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ALIASES = {
  name: ["name", "customer name", "customer", "full name"],
  phone: ["mobile number", "mobile", "mobile no", "phone", "phone number", "contact", "contact number"],
  alt_phone: ["alternate phone", "alt phone", "alternate number"],
  email: ["email id", "email", "e mail", "email address"],
  address: ["address"],
  installed_on: ["date", "install date", "installed on", "installation date", "installed date"],
  plan_amount: ["plan amount", "amount", "plan price"],
  last_recharge_on: ["last recharge", "last recharge date", "recharge date", "last recharged"],
  status: ["status"],
  modem: ["modem", "modem type", "modem status"],
  mac_address: ["mac address", "mac", "modem mac", "mac id"],
  serial_no: ["serial", "serial no", "serial number", "modem serial"],
  "f:username": ["user name", "username", "user id", "login"],
  "f:password": ["password"],
  "f:plan_name": ["plan name", "plan"],
  "f:vlan": ["vlan id", "vlan"],
  "f:landline_no": ["landline number", "landline", "landline no"],
  "f:account_no": ["account no", "account number", "account"],
  "f:voip_password": ["voip password", "voice password"],
  "f:static_ip": ["static ip", "static ip address"],
  "f:aadhaar_no": ["aadhaar card number", "aadhaar number", "aadhar number", "aadhaar", "aadhar", "aadhar card number"],
};

// { columnIndex: targetId } — each target used by at most one column. Columns
// with no match (e.g. "Timestamp") are left out = ignored.
export function autoMap(headers, provider) {
  const targets = buildTargets(provider);
  const byNorm = new Map();
  for (const t of targets) {
    byNorm.set(normHeader(t.label), t.id);
    if (t.id.startsWith("f:")) byNorm.set(normHeader(t.id.slice(2)), t.id);
    for (const a of ALIASES[t.id] || []) if (!byNorm.has(a)) byNorm.set(a, t.id);
  }
  const used = new Set();
  const map = {};
  headers.forEach((h, i) => {
    const id = byNorm.get(normHeader(h));
    if (id && !used.has(id)) {
      map[i] = id;
      used.add(id);
    }
  });
  return map;
}

// ---- Cleaning ----
const PLACEHOLDER = /^(-+|_+|\.+|na|n\/a|nil|none|null|no|not available)$/i;
export const isPlaceholder = (v) => {
  const t = String(v ?? "").trim();
  return t === "" || PLACEHOLDER.test(t);
};
const text = (v) => (isPlaceholder(v) ? "" : String(v).trim().replace(/\s+/g, " "));

export const looksLikeIp = (v) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(v ?? "").trim());

export function cleanPhone(v) {
  if (isPlaceholder(v)) return "";
  let d = String(v).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

// "" when blank, null when it can't be an email, else the lowercase address.
export function cleanEmail(v) {
  if (isPlaceholder(v)) return "";
  const e = String(v).replace(/\s+/g, "").toLowerCase();
  return /^[^@]+@[^@]+\.[^@]+$/.test(e) ? e : null;
}

// order "mdy" (Google Forms / US) or "dmy". Accepts 2-digit years, / - . separators,
// ISO yyyy-mm-dd and a trailing time. Returns "YYYY-MM-DD" or null.
export function parseDate(v, order = "mdy") {
  const s = String(v ?? "").trim();
  if (isPlaceholder(s)) return "";
  let y, m, d;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (r) [y, m, d] = [r[1], r[2], r[3]];
  else {
    r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!r) return null;
    const [a, b] = [Number(r[1]), Number(r[2])];
    [m, d] = order === "dmy" ? [b, a] : [a, b];
    y = r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3]);
  }
  [y, m, d] = [Number(y), Number(m), Number(d)];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// A price in a plan name ("599/60Mbps/3300GB" -> 599): a standalone 3-4 digit number.
export function suggestPlanAmount(plan) {
  for (const tok of String(plan ?? "").split(/[^a-z0-9]+/i)) {
    if (/^\d{3,4}$/.test(tok)) return Number(tok);
  }
  return null;
}

const STATUS_WORDS = {
  active: CONNECTION_STATUS.ACTIVE,
  inactive: CONNECTION_STATUS.INACTIVE,
  disconnected: CONNECTION_STATUS.DISCONNECTED,
  disconnect: CONNECTION_STATUS.DISCONNECTED,
};
const MODEM_WORDS = { ftu: "ftu", own: "customer", customer: "customer", "own modem": "customer", none: "none" };

// ---- Rows ----
// rows: array of arrays (data rows only). mapping: { colIndex: targetId }.
// opts: { dateOrder, defaultStatus, lastRechargeAll, macKind ("ftu"|"customer"),
//         fillPlanAmount }
export function cleanRows(rows, mapping, provider, opts = {}) {
  const {
    dateOrder = "mdy",
    defaultStatus = CONNECTION_STATUS.ACTIVE,
    lastRechargeAll = "",
    macKind = "customer",
    fillPlanAmount = false,
  } = opts;
  const colOf = {};
  for (const [i, id] of Object.entries(mapping)) colOf[id] = Number(i);
  const fields = provider?.fields || [];

  return rows.map((raw, idx) => {
    const get = (id) => (colOf[id] === undefined ? "" : raw[colOf[id]] ?? "");
    const warnings = [];
    const errors = [];

    const name = text(get("name"));
    if (!name) errors.push("Missing name");

    const phone = cleanPhone(get("phone"));
    const altPhone = cleanPhone(get("alt_phone"));
    let email = cleanEmail(get("email"));
    if (email === null) {
      warnings.push("Email dropped (not a valid address)");
      email = "";
    }

    const dateOf = (id, label) => {
      const d = parseDate(get(id), dateOrder);
      if (d === null) warnings.push(`${label} ignored (couldn't read "${String(get(id)).trim()}")`);
      return d || "";
    };
    const installedOn = dateOf("installed_on", "Install date");
    const lastRecharge = colOf.last_recharge_on !== undefined ? dateOf("last_recharge_on", "Last recharge") : lastRechargeAll || "";

    // The provider's fields (user name, password, VLAN ...); defaults fill blanks.
    const values = {};
    for (const f of fields) {
      let v = text(get(`f:${f.key}`));
      if (f.column === "plan_name" && looksLikeIp(v)) {
        warnings.push("Plan was an IP address (dropped)");
        v = "";
      }
      if (!v && f.default !== undefined) v = f.default;
      if (v) values[f.key] = v;
    }

    let planAmount = text(get("plan_amount"));
    planAmount = planAmount ? Number(String(planAmount).replace(/[^\d.]/g, "")) || "" : "";
    const planName = values[(fields.find((f) => f.column === "plan_name") || {}).key];
    const suggested = !planAmount && planName ? suggestPlanAmount(planName) : null;
    if (!planAmount && fillPlanAmount && suggested) planAmount = suggested;

    const stRaw = text(get("status")).toLowerCase();
    let status = STATUS_WORDS[stRaw] || defaultStatus;
    if (stRaw && !STATUS_WORDS[stRaw]) warnings.push(`Status "${stRaw}" not recognised (using ${defaultStatus})`);

    // Modem: explicit column, else a MAC makes one with the chosen ownership.
    let mac = "";
    const macRaw = text(get("mac_address"));
    if (macRaw) {
      const n = normalizeMac(macRaw);
      if (n === null) warnings.push("MAC address ignored (not valid)");
      else mac = n;
    }
    const serial = text(get("serial_no"));
    let kind = MODEM_WORDS[text(get("modem")).toLowerCase()] || null;
    if (!kind && (mac || serial)) kind = macKind;
    const modem = kind && kind !== "none" ? { kind, mac, serial } : null;

    const { details, ...cols } = splitFieldValues(fields, values);
    return {
      n: idx + 1, // row number in the sheet (data rows)
      raw,
      customer: { name, phone, alt_phone: altPhone, email, address: text(get("address")) },
      conn: { values, cols, details, installedOn, planAmount, status, lastRechargeOn: lastRecharge },
      suggestedAmount: suggested,
      modem,
      warnings,
      errors,
    };
  });
}

// ---- Classifying ----
// kind: "error" | "duplicate" (same provider + user name already saved) |
// "possible_duplicate" (user name or landline repeated in the sheet) |
// "existing" (customer already saved: new connection only) | "new".
// include: whether the row is ticked to import by default.
export function classifyRows(cleaned, { customers = [], provider }) {
  const pool = customers.map((c) => ({ ...c, _db: true }));
  const key = (s) => String(s ?? "").trim().toLowerCase();
  const usernameOf = (r) => key(r.conn.cols.username);
  const landlineOf = (r) => key(r.conn.details.landline_no).replace(/\s+/g, "");

  const savedUsers = new Set();
  const savedLandlines = new Map(); // landline -> saved customer's name
  for (const c of customers)
    for (const l of c.connections || []) {
      if (l.provider_id === provider?.id && l.username) savedUsers.add(key(l.username));
      const ll = key(l.details?.landline_no).replace(/\s+/g, "");
      if (ll) savedLandlines.set(ll, c.name);
    }

  const seenUser = new Map();
  const seenLandline = new Map();
  let nextTemp = 1;

  return cleaned.map((r) => {
    const out = { ...r, kind: "new", include: true, reason: "", customerRef: null };
    if (r.errors.length) return { ...out, kind: "error", include: false, reason: r.errors.join("; ") };

    const user = usernameOf(r);
    const land = landlineOf(r);
    if (user && savedUsers.has(user))
      return { ...out, kind: "duplicate", include: false, reason: "Already saved (same provider + user name)" };

    const reasons = [];
    if (user && seenUser.has(user)) reasons.push(`user name repeated (row ${seenUser.get(user)})`);
    if (land && seenLandline.has(land)) reasons.push(`landline repeated (row ${seenLandline.get(land)})`);
    if (user && !seenUser.has(user)) seenUser.set(user, r.n);
    if (land && savedLandlines.has(land)) reasons.push(`landline already saved for ${savedLandlines.get(land)}`);
    if (land && !seenLandline.has(land)) seenLandline.set(land, r.n);

    const match = findMatchingCustomer(pool, r.customer);
    if (match) {
      out.customerRef = match._db ? { id: match.id } : { temp: match._temp };
      if (match._db) {
        out.kind = "existing";
        out.reason = `Existing customer "${match.name}" gets a new connection`;
      } else out.reason = `Same customer as row ${match._row}`;
    } else {
      const temp = nextTemp++;
      pool.push({ ...r.customer, _temp: temp, _row: r.n });
      out.customerRef = { temp };
    }

    if (reasons.length) {
      out.kind = "possible_duplicate";
      out.include = false;
      out.reason = `Possible duplicate: ${reasons.join(", ")}`;
    }
    return out;
  });
}

// ---- Template ----
// Header row + one example row for the downloadable template.
export function templateRows(provider) {
  const fields = provider?.fields || [];
  const headers = [
    "Name", "Mobile number", "Alternate phone", "Email id", "Address", "Install date",
    ...fields.map((f) => f.label),
    "Plan amount", "Status", "Last recharge date", "Modem", "Modem MAC address", "Modem serial",
  ];
  const example = [
    "Example Customer", "9000000000", "", "name@example.com", "Main road", "15/02/2020",
    ...fields.map((f) => (f.default !== undefined ? f.default : "")),
    "599", "Active", "", "FTU", "AA:BB:CC:DD:EE:FF", "",
  ];
  return [headers, example];
}
