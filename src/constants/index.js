// Central place for all fixed values used across the app.
// Keeping them here means we change a label or rate in ONE place.

// ---- Roles ----
export const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
};

// Friendly labels + the list an admin can pick from when approving a user.
export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Admin (full control)",
  [ROLES.STAFF]: "Staff (add & view)",
};

export const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.STAFF];

// ---- Account approval status ----
export const USER_STATUS = {
  PENDING: "pending", // signed up, waiting for an admin to approve
  APPROVED: "approved", // can log in and use the app
  DISABLED: "disabled", // blocked from logging in (reversible)
};

export const USER_STATUS_LABELS = {
  [USER_STATUS.PENDING]: "Pending approval",
  [USER_STATUS.APPROVED]: "Active",
  [USER_STATUS.DISABLED]: "Disabled",
};

// Emails that become admin automatically on signup. Keep in sync with the
// admin_emails list inside set_profile_on_signup() in the SQL (the SQL is the
// real gate; this is only used for friendly messaging in the app).
export const ADMIN_EMAILS = [
  "ponseelan.11@gmail.com",
  "rajbroadbandsendamaram@gmail.com",
];

// ---- Workers ----
export const WORKER_TYPES = {
  SALARY: "salary",
  CONTRACT: "contract",
};

// Friendly labels shown in the UI (DB still stores "salary" / "contract").
export const WORKER_TYPE_LABELS = {
  [WORKER_TYPES.SALARY]: "Employee",
  [WORKER_TYPES.CONTRACT]: "Contract worker",
};

export const WORK_TYPES = {
  SPLICING: "splicing",
  WIRE_LAYING: "wire_laying",
  OTHER: "other",
};

// ---- Worker transactions ----
export const TRANSACTION_TYPES = {
  ADVANCE: "advance", // money given before work/salary
  WORK: "work", // work done (earns the worker money)
  PAYMENT: "payment", // money actually paid out
};

// ---- Contract work rates (business rules from the master plan) ----
export const SPLICING_RATES = {
  LOW_JOINT_LIMIT: 4, // up to 4 joints
  LOW_RATE: 100, // per joint when joints <= 4
  HIGH_RATE: 90, // per joint when joints >= 5
};

export const WIRE_LAYING_RATE_PER_KM = 3500;

// ---- Stock transactions ----
export const STOCK_TYPES = {
  PURCHASE: "purchase", // stock in (creates an expense)
  SALE: "sale", // stock out + income
  USAGE: "usage", // stock out for service work (no income)
  LOSS: "loss", // stock out because it was damaged / missing / returned (no income)
  OPENING: "opening", // stock you already had — stock in, NO expense (cost optional)
  RETURN: "return", // customer brought an item back — stock in, optional refund out
};

// ---- Payment methods (how money was received) ----
// "Online" covers GPay / PhonePe / any UPI or bank transfer.
export const PAYMENT_METHODS = ["Cash", "Online"];
// "Split" = part Cash + part Online in one payment (the two amounts are stored
// on the expense as cash_amount / online_amount). Used for money going OUT
// (worker pay, purchases), where a single payout can be split.
export const PAYMENT_SPLIT = "Split";
export const PAYMENT_METHODS_SPLIT = ["Cash", "Online", "Split"];

// ---- Stock loss reasons (why stock was written off) ----
export const LOSS_REASONS = [
  "Damaged",
  "Missing",
  "Defective / not working",
  "Returned to vendor",
  "Other",
];

// ---- Product classification ----
export const PRODUCT_TYPES = {
  SHOP: "shop", // resale goods (remote, torch, HDMI...)
  SERVICE: "service", // materials used for cable work (fiber, splitter...)
};

export const PRODUCT_TYPE_LABELS = {
  [PRODUCT_TYPES.SHOP]: "Shop product",
  [PRODUCT_TYPES.SERVICE]: "Service material",
};

// A product's "use" can be one or more types, stored comma-joined
// (e.g. "shop,service"). This renders the friendly label(s).
export function productTypeLabel(value) {
  const parts = String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "-";
  return parts.map((p) => PRODUCT_TYPE_LABELS[p] || p).join(" + ");
}

// ---- Categories (used in dropdowns) ----
export const PRODUCT_CATEGORIES = [
  "Cable",
  "Router",
  "Other",
];

// Short code prefixes per product category (e.g. Cable → CAB001). Unknown
// categories fall back to their first 3 letters in productsService.
export const PRODUCT_CODE_PREFIXES = {
  Cable: "CAB",
  Connector: "CON",
  ONU: "ONU",
  Router: "RTR",
  Fiber: "FIB",
  Splitter: "SPL",
  Other: "OTH",
};

export const INCOME_CATEGORIES = [
  "Recharge",
  "New connection",
  "Installation",
  "Product sales",
  "Other",
];

// ---- Income sources (cable TV / broadband business) ----
// mode drives which fields the Add-Income form shows:
//   simple   -> just an amount
//   device   -> product (reduces stock); optional charge if `charge: true`
//   provider -> provider dropdown + amount
// device notes: a product with price 0 is treated as "free" (stock still drops,
// no sale income); `variants` adds a HD/SD style toggle; `charge` adds a
// separate connection/install charge field.
export const INCOME_SOURCES = [
  { key: "cable_collection", label: "Cable Collection", icon: "📺", mode: "simple" },
  {
    key: "shop_collection",
    label: "Shop Collection",
    icon: "🛒",
    mode: "device",
    hint: "Pick the product sold (remote, splitter, etc.)",
    charge: false,
  },
  { key: "daily_collection", label: "Daily Collection", icon: "🧾", mode: "simple" },
  { key: "home_collection", label: "Home Collection", icon: "🏠", mode: "simple" },
  {
    key: "new_cable",
    label: "New Cable",
    icon: "📡",
    mode: "device",
    hint: "Pick the set-top box being given",
    variants: ["HD", "SD"],
    charge: false,
  },
  {
    key: "new_internet",
    label: "New Internet",
    icon: "🌐",
    mode: "device",
    hint: "Pick the modem / ONU (price 0 if free)",
    charge: true,
    chargeLabel: "Install charge (₹ — 0 if free)",
  },
  {
    key: "internet_recharge",
    label: "Internet Recharge",
    icon: "🔄",
    mode: "provider",
  },
  { key: "other", label: "Other", icon: "➕", mode: "simple" },
];

// Starting list for the recharge provider dropdown (users can add more).
export const INTERNET_PROVIDERS = ["BSNL", "TIC Fiber"];

// ---- ID Recharge (expense) ----
// Money paid to the MSO / provider to recharge a subscriber ID. The expense is
// booked under this category; the chosen ID and the month it's FOR are kept in
// the note (e.g. "TCCL 041 · for Jul 2026"). Starting IDs — users can type new
// ones from the form, and previously-used IDs are remembered.
export const ID_RECHARGE_CATEGORY = "ID Recharge";
export const RECHARGE_IDS = ["TCCL 041", "TCCL 176", "TIC"];

// Categories offered in the manual "General expense" form. Auto-managed ones
// (Staff salary, Product purchase, worker categories, Customer refund) are
// deliberately NOT here — they're created automatically from their source
// (worker pay / purchase / return), so adding them by hand would double-count.
// See `lockedCategories` in pages/Expense.jsx.
export const EXPENSE_CATEGORIES = [
  "Electricity",
  "Fuel",
  "Water",
  "Parcel",
  "For Home",
  "Office expenses",
  "Other",
];

// ---- Sidebar navigation (grouped by section) ----
export const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: "📊", group: "Main" },

  { label: "Income", path: "/income", icon: "🟢", group: "Finance" },
  { label: "Expense", path: "/expense", icon: "🔴", group: "Finance" },
  { label: "Pending", path: "/pending", icon: "⏳", group: "Finance" },

  { label: "Products", path: "/products", icon: "📦", group: "Inventory" },
  { label: "Vendors", path: "/vendors", icon: "🏪", group: "Inventory" },
  { label: "Buy Plan", path: "/purchase-plan", icon: "🧮", adminOnly: true, group: "Inventory" },

  { label: "Workers", path: "/workers", icon: "👷", adminOnly: true, group: "Team" },
  { label: "Users", path: "/users", icon: "👥", adminOnly: true, group: "Team" },

  { label: "Settings", path: "/settings", icon: "⚙️", group: "System" },
];
