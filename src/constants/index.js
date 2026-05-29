// Central place for all fixed values used across the app.
// Keeping them here means we change a label or rate in ONE place.

// ---- Roles ----
export const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  VIEWER: "viewer",
};

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
};

// ---- Product classification ----
export const PRODUCT_TYPES = {
  SHOP: "shop", // resale goods (remote, torch, HDMI...)
  SERVICE: "service", // materials used for cable work (fiber, splitter...)
};

export const PRODUCT_TYPE_LABELS = {
  [PRODUCT_TYPES.SHOP]: "Shop product",
  [PRODUCT_TYPES.SERVICE]: "Service material",
};

// ---- Categories (used in dropdowns) ----
export const PRODUCT_CATEGORIES = [
  "Cable",
  "Connector",
  "ONU",
  "Router",
  "Fiber",
  "Splitter",
  "Other",
];

export const INCOME_CATEGORIES = [
  "Recharge",
  "New connection",
  "Installation",
  "Product sales",
  "Other",
];

export const EXPENSE_CATEGORIES = [
  "Staff salary",
  "Product purchase",
  "Electricity",
  "Fuel",
  "Office expenses",
  "Other",
];

// ---- Sidebar navigation ----
export const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: "📊" },
  { label: "Workers", path: "/workers", icon: "👷" },
  { label: "Products", path: "/products", icon: "📦" },
  { label: "Vendors", path: "/vendors", icon: "🏪" },
  { label: "Income", path: "/income", icon: "🟢" },
  { label: "Expense", path: "/expense", icon: "🔴" },
  { label: "Reports", path: "/reports", icon: "📑" },
  { label: "Settings", path: "/settings", icon: "⚙️" },
];
