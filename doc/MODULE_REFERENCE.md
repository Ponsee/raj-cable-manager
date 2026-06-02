# Raj Cable Manager — Module Reference (Workers · Products · Vendors · Income · Expense)

Last updated: 2026-05-30. This documents the features built so far in the
**Workers**, **Products**, **Vendors**, **Income**, and **Expense** modules,
plus the setup steps (migrations / Supabase config) needed for them to work.

> **UI note:** the app now uses **MUI (Material UI)**. Shared UI primitives
> (`Button`, `Modal`, `StatCard`, `PageHeader`, `DateRangePicker`) and the
> finance/product forms are built on MUI, themed via `src/theme.js` (indigo
> brand) and wrapped in `ThemeProvider` + `LocalizationProvider` in `main.jsx`.
> Tailwind is still used for page layout.

---

## ⚙️ Setup checklist (run these in Supabase once)

**SQL Editor → run each migration in `supabase/migrations/`:**

| Migration file | Adds |
|---|---|
| `2026-05-22_add_salary_pay_day.sql` | `workers.salary_pay_day` |
| `2026-05-29_add_worker_pricing.sql` | `workers.pricing` (jsonb) |
| `2026-05-29_product_fields.sql` | `products.product_type`, `subcategory`, `image_url` |
| `2026-05-29_product_selling_price.sql` | `products.selling_price` + `stock_transactions.selling_price` |
| `2026-05-29_vendors.sql` | `vendors` table + `stock_transactions.vendor_id` + RLS |
| `2026-05-30_auth_approval.sql` | `profiles` email/phone/status/approval + signup trigger + admin update policy |
| `2026-05-30_income_payment_and_stock_loss.sql` | `income.payment_method` (Cash/Online) + `idx_stock_tx_type` |
| `2026-05-30_income_stock_link.sql` | `income.stock_tx_id` → links a product sale to its stock movement |
| `2026-05-30_product_code_images.sql` | `products.code` (easy ID) + `products.image_urls` (multi-image) |
| `2026-05-30_product_images_bucket.sql` | creates the `product-images` storage bucket + upload/read policies |
| `2026-05-30_purchase_discount_transport.sql` | `stock_transactions.discount` + `transport` (per bulk order) |
| `2026-05-30_purchase_expense_link.sql` | `stock_transactions.expense_id` → links a purchase to its expense (for batch delete) |
| `2026-05-30_worker_tx_expense_link.sql` | `worker_transactions.expense_id` → links worker pay to its expense (for delete) |

**Storage:** the `product-images` bucket is created by the migration above
(running `2026-05-30_product_images_bucket.sql` in the SQL Editor). You can also
create it manually: Storage → New bucket → name `product-images` → Public: ON,
but then you still need upload policies — running the migration is easier.

**npm packages added:** `qrcode.react`, `html5-qrcode`, **`@mui/material`,
`@mui/icons-material`, `@emotion/react`, `@emotion/styled`,
`@mui/x-date-pickers`, `@mui/x-charts`, `dayjs`** (run `npm install` if pulling fresh).

> The app degrades gracefully if a migration hasn't been run yet (e.g. income
> still loads without `payment_method`/`stock_tx_id`; products save without
> `code`/`image_urls`). Run them to get the full behavior.

> `schema.sql` is the full fresh-setup script and already includes all of the above.

---

## 🔐 Authentication & users

### Sign up (name + mobile)
- Signup collects **full name**, **mobile number**, email, password.
- A new `profiles` row is created with `name`, `phone`, `email`; the DB trigger
  decides `role` + `status` (the client never sets these).

### Admin approval gate
- `profiles.status` = `pending` | `approved` | `disabled` (default `pending`).
- **Admin emails** in `set_profile_on_signup()` (SQL) auto-approve as **admin**
  on signup. Edit that `admin_emails` list + re-run the function to change who's
  an admin. (`ADMIN_EMAILS` in `constants/index.js` mirrors it for messaging.)
- Everyone else is **pending** until an admin approves them and picks a role.
- `get_user_role()` returns a role **only when `status = 'approved'`**, so
  disabling a user instantly cuts off all data access (RLS).
- Login is gated in two places: `Login.jsx` checks status after sign-in (shows
  "waiting for approval" / "disabled" and signs them out), and `AuthContext`
  signs out any restored session that isn't approved.

### Roles
- **Admin** (full control) and **Staff** (add & view). Viewer dropped from the
  UI (`ASSIGNABLE_ROLES`). Existing viewer RLS read policies are harmless.

### Forgot / reset password
- "Forgot password?" on the login card emails a reset link
  (`resetPasswordForEmail`, redirects to `/reset-password`).
- `ResetPassword.jsx` (public route) sets the new password via `updateUser`.

### Users admin screen (`/users`, admin only)
- `services/usersService.js`: `getProfiles`, `approveUser(id, role, by)`,
  `setUserRole`, `setUserStatus`, `getPendingCount`.
- **Approval requests** section (pending users) → **Approve & set role** (modal:
  Admin/Staff) or **Reject** (→ disabled). **All users** table → change role,
  **Disable** / **Enable** (via `ConfirmDialog`). You can't change your own row.
- **Nav badge:** the **👥 Users** item shows only for admins, with an amber
  badge of the pending-approval count.

---

## 👷 Workers module

### Worker types
- Two types: **Employee** (`type = "salary"`) and **Contract worker** (`type = "contract"`).
  UI labels via `WORKER_TYPE_LABELS`; DB still stores `salary`/`contract`.
- Add/Edit use a shared form `components/forms/WorkerForm.jsx`.
- Employee fields: monthly salary, **salary pay day** (1–31). Contractor fields:
  work type + **per-worker pricing**.

### Transaction types
- **Employee:** `salary`, `advance`, `bonus`, `increment`, `expense`
- **Contractor:** `work`, `advance`, `bonus`, `expense` (no "payment" — paying
  happens through the Work entry)
- `worker_transactions.type` is free text (no DB constraint).

### Money logic (`utils/workerCalc.js` → `calcBalance(txs, workerType)`)
- **Employee Balance Due** = outstanding advance = `max(0, advancesGiven − advancesReduced)`.
- **Contractor Balance Due** = also outstanding advance — because Work is paid at
  entry (gross − advance reduced = net to pay), so the only running balance is the
  unsettled advance. `Total Advance` shows this outstanding amount (drops when work settles it).
- `expense` entries are tracked separately and **never** affect balance/pay.
- Advance reductions are read from `work_details.advance_reduced` on any salary/work entry.

### Salary entry
- Net = `monthly_salary − (leaveDays × monthly/30) − advanceToReduce`, with a live breakdown.

### Contractor work entry (splicing only, per joint)
- Enter joints → gross (per-joint pricing); optional **Advance to reduce** → net to pay.
- Stored `work_details = { work_type:"splicing", joints, advance_reduced, net }`.

### Per-contractor pricing (`workers.pricing` jsonb)
- splicing → `{ low_joint_limit, low_rate, high_rate }` (defaults 4/100/90)
- wire_laying → `{ rate_per_km }` (default 3500)
- `calcSplicing(joints, pricing)` / `calcWireLaying(km, pricing)` use it, falling
  back to global `SPLICING_RATES` / `WIRE_LAYING_RATE_PER_KM`.

### Expense type (petrol / other)
- Money given to a worker (Petrol/Food/Travel/Material/Other) that is **not**
  deducted from pay. `type="expense"`, `calculated_amount=0`, `work_details={purpose}`.

### Worker pay flows into the Expense ledger
- `addWorkerTransaction(tx, { workerName })` auto-creates a matching **Expense**
  row for every **cash-out** transaction, so business expenses include worker pay:
  - `salary` → **Staff salary** (net paid), `advance` → **Worker advance**,
    `payment` → **Staff payment**, `bonus` → **Staff bonus**,
    `expense` → **Worker expense**, `work` → **Contract work** (uses the **net**
    = gross − advance reduced, so advances aren't double-counted).
  - **`work`'s net** and **`increment`** (a raise record, no cash) are the only
    types not expensed as full amounts; `increment` is skipped entirely.
- Expense rows are labelled with the worker's name. Applies to new transactions
  only (no back-fill of past worker pay).
- ⚠️ Don't also add salaries manually on the Expense page — that would double-count.

### Delete a worker transaction (with expense reversal)
- Each history row has a 🗑️ delete (with confirm). `deleteWorkerTransaction(tx)`
  removes the worker entry **and** its linked auto-expense (`worker_transactions.expense_id`),
  so balances recalculate and the Expense ledger stays in sync. Entries created
  before the link migration delete the worker row but not the old expense.

### Auto-note saves reliably
- The note is built by `buildNote()` and saved **at submit time** (not only via the
  live effect), so the auto-generated note always persists. History shows the note
  for every type (falls back to the computed description for Work only when blank).
- The note captures the full picture: e.g. salary → "June 2026, Advance reduced: ₹X,
  Remaining advance: ₹Y, Net paid: ₹Z"; contract work → "N joints, Advance reduced:
  ₹X, Remaining advance: ₹Y, Net paid: ₹Z".

### Add Transaction form
- One **Date** field for **every** type (default today, `max` = today) lets you
  backdate any entry; `txTimestamp()` keeps the current time so same-day rows stay
  ordered, and the date flows to the auto-created expense too.
- Salary and contract-work breakdowns show **Current advance → Reduce → Remaining
  advance → Net to pay**, updating live as you type the reduction.
- Modal is medium-sized (`size="md"`) and compact.

### UI
- Add Transaction: type buttons on one responsive row; auto-filled note for every type.
- One reusable `HistoryModal` per stat card (Salary / Bonus / Increment / Advance /
  Balance reduction / Expense), each with its **own** date range (independent of the page).
- Stat cards per type (incl. **Total Expense** ⛽). Transaction history has inner
  scroll + sticky header. Workers list "Balance Due" matches the details page.

---

## 📦 Products module

### Product fields
- `code` (easy ID), `name`, `product_type` (**one or more** of Shop / Service),
  `category`, `subcategory` (brand, e.g. TCCL/Airtel), `unit`,
  `selling_price`, `minimum_stock` (low-stock alert), `image_url` (primary),
  `image_urls` (all photos).
- **Product use is multi-select** (MUI ToggleButtonGroup) — a product can be both
  Shop + Service. Stored comma-joined (e.g. `shop,service`); `productTypeLabel()`
  renders the label(s); the list filter matches with `.split(",").includes()`.
- **Category & Sub-category** are both **MUI Autocomplete** comboboxes (free-solo):
  a dropdown of existing values you can pick, or type a new one.
- Add/Edit use shared `components/forms/ProductForm.jsx`; edit dialog is the shared
  `components/products/EditProductModal.jsx` (used by both list and details).

### Easy-to-remember product code (`products.code`)
- Auto-generated per category prefix + running number: **Cable→CAB001,
  Connector→CON001, ONU→ONU001, Router→RTR001, Fiber→FIB001, Splitter→SPL001,
  Other→OTH001** (unknown categories use the first 3 letters). Map in
  `PRODUCT_CODE_PREFIXES`; generation in `productsService.generateProductCode()`.
- **Editable** by the user in Add/Edit (blank = auto-assign). Shown as a badge in
  the products list and in the details header.

### Multiple images (up to 5) — upload or camera
- `components/products/ProductImages.jsx`: pick several from the gallery
  (**Upload**, `multiple`) or take a photo (**Camera**, `capture="environment"`),
  each removable; first photo is the **Main** one (`image_url`), all stored in
  `image_urls`. Each file uploaded via `uploadProductImage`.
- Details page shows the **main image + clickable thumbnail strip** (placeholder
  box when a product has no photo).

### Stock (always computed — Business Rule 2)
- `utils/productCalc.js → calcStock(txs)`: stock = purchased − sold − used − **lost**;
  also returns purchase/sale value, last purchase price, stock value, usedQty,
  **lostQty**, **lossValue**.
- `isLowStock(stock, min)`, `pricesByVendor(txs)` (cheapest-first vendor comparison).

### Stock entry types (`stock_transactions.type`)
- **Purchase** 🛒 — stock in; creates an **Expense**; per-batch **selling price**;
  pick a **vendor**.
- **Sale** 💰 — stock out; creates an **Income**; pre-filled from selling price;
  blocked if it exceeds available stock.
- **Used in service** 🔧 — stock out, **no income** (materials consumed on a job).
- **Loss / damage** ⚠️ — stock out, **no income**; written off as damaged /
  missing / defective / returned. Reason stored in `note` (`LOSS_REASONS`).

### Report Loss / Damage (`components/products/StockLossModal.jsx`)
- A shared "Report Loss / Damage" action on **Product Details** (product fixed)
  and the **Income page** (pick any product). Reduces stock, creates **no**
  income/expense; capped at available stock. Service: `recordStockLoss()`.
- Details page has a clickable **⚠️ Lost / Damaged** card (qty + approx value) →
  loss history with the date-range filter; also a "Lost / damaged" row + filter
  + red badge in stock history.

### Selling price (per purchase batch)
- Stored per purchase on `stock_transactions.selling_price` (can differ each batch).
- `products.selling_price` caches the **latest** one; pre-fills Sales + Scan-to-Sell.
- Editable directly in the product form; shown in the profile + stock history
  (`· sell @ ₹X`).

### Price history chart
- Product details shows a **MUI X LineChart** (`@mui/x-charts`) of **buy price**
  (cost) vs **sell price** per purchase over time. Plotted on an index x-axis
  (dates as labels) so same-day purchases don't collapse; marks shown; the sell
  line falls back to the product's current selling price when a purchase didn't
  record one.

### Price by vendor (+ cross-navigation)
- Product details shows each vendor's **lowest + latest** purchase price, sorted
  **cheapest first by the LATEST price** (green "cheapest" tag).
- Each vendor name **links to that vendor's page** (`/vendors/:id`) — using the
  stored `vendor_id`, or matched by name (case-insensitive) against the vendor
  list when an old purchase has no id.
- Reverse: vendor purchase history links each product back to `/products/:id`.

### Product ID shown
- The `code` shows in the page header and as a **Product ID** row in the details.

### QR + scan-to-sell
- Each product page renders a **QR** (encodes the product id) with **Print label**.
- **📷 Scan to Sell** (Products list) opens the camera (`html5-qrcode`), finds the
  product, and records a Sale. (Needs HTTPS or localhost.)

### Full CRUD
- List: Add, **Edit**, **Delete** per row, search + type/category filters
  (category filter includes newly-added categories).
- Details: Edit + **Delete**, stock cards, low-stock banner, **date-range filter**
  on stock history, QR/print.

---

## 🏪 Vendors module

- `vendors` table: `name`, `phone`, `address`, `note`. Nav item **🏪 Vendors**.
- **List** (`/vendors`): search, add, shows orders count + total spent per vendor.
- **Details** (`/vendors/:id`): profile + stats (Total Orders, Total Spent),
  **Edit**, **Delete** (unlinks past purchases, keeps history).
- **Pick a vendor when buying** (in the product Add-Stock purchase flow): dropdown
  of vendors + "➕ Add new vendor". Stored as `vendor_id` (+ `vendor_name` snapshot).
- **Bulk Purchase** (from a vendor): add many products at once —
  product (with "➕ Add new product" inline), qty, cost, sell price per line;
  order-level **Discount** and **Transport cost**; records one purchase row per
  line + one combined **Expense** (`subtotal − discount + transport`).
  - `discount`/`transport` are stored on the **first row** of the batch (others 0)
    so summing a batch is correct; each purchase row is linked to its `expense_id`.
- **Purchase history**: **By batch** view (one order = one block, with a
  **Subtotal → −Discount → +Transport → Net** breakdown) or **All items**, plus a
  **date-range filter**. Product names link back to `/products/:id`.
- **Delete a purchase batch** (🗑️ on a batch): `deletePurchaseBatch(items)` removes
  the **stock movements AND the linked expense** together — so product stock,
  vendor history, and expenses all stay in sync (only fully for purchases made
  after the `expense_id` migration). ⚠️ Can push stock negative if some was
  already sold.

---

## 🟢 Income module (`pages/Income.jsx`)

### Sources & batch entry
- **Add Income** is a batch form (one date, many entries). `INCOME_SOURCES`
  drive the fields per entry via a `mode`:
  - `simple` (Daily Collection, Cable Collection, Other) → just an amount.
  - `device` (Shop Collection, New Cable HD/SD, New Internet) → **multiple
    products** (each qty + price), optional **charge** (e.g. install). Priced
    item → **Sale** (income + stock out); ₹0 item → **Used** (stock out, no income).
  - `provider` (Internet Recharge) → provider (`INTERNET_PROVIDERS`, add-new) + amount.
- Source order (most-used first): **Cable Collection · Shop Collection · Daily
  Collection** · New Cable · New Internet · Internet Recharge · Other (entry 1
  defaults to Cable Collection).
- Device-line **product pickers are searchable MUI Autocomplete** (Add Income +
  the Report Loss modal) — type to find a product.
- Over-sell guard aggregates product quantities across the whole batch.

### Payment method (Cash / Online)
- Per-entry **Paid via** toggle: **Cash** or **Online** (Online = GPay/PhonePe/UPI).
  Stored on `income.payment_method`. Anything non-Cash is treated as Online
  (covers old GPay/Other rows). Service: `addEntry`/`addStockTransaction` carry it.

### Cash over/short adjustment
- A single **Cash extra (+) / short (−)** field (separate from the source list).
  It auto-adjusts the total and saves as an `Adjustment` income row tagged
  **Cash** (online is always exact, so the adjustment is cash-only).

### History, cards, filters
- **Daily** view groups entries by day; each day header shows **💵 cash · 📱 online ·
  total** and a 🗑️ **batch-delete**. **All** view is a flat table. Both scroll.
- The shared **DateRangePicker** sits in the page header (next to Add Income); all
  cards + the breakdown are computed for that range.
- Stat cards: Today's collection · Total (range) · **This vs last month** (▲/▼ %,
  up = green for income) · **Cash** · **Online** · Avg/day · **Days with income**.
- **By-source breakdown** list (each source + total + % bar) for the range.
- Filters: search, **payment** (All/Cash/Online), Export CSV. Per-row 🗑️ delete too.

### Product sale ↔ stock link & edit/delete
- Each product-sale income row links to its stock movement via `income.stock_tx_id`
  (set in `addStockTransaction`).
- **Delete restores stock:** `deleteIncomeEntry` / `deleteIncomeBatch` remove the
  linked `stock_transactions` row, so stock is added back (since stock is computed).
  Only works for sales recorded **after** the `stock_tx_id` migration; older/unlinked
  sales delete money only.
- `updateProductSale()` exists to edit a sale's product/qty/price and keep stock in
  sync (the interactive batch *edit* UI was removed in favor of batch delete).

---

## 🔴 Expense module (`pages/Expense.jsx` via `components/finance/LedgerPage.jsx`)

- Shared **LedgerPage** ledger (table `expenses`). The **DateRangePicker** is in
  the header (next to Add Expense); all cards + breakdown use that range.
- **Cards:** Total Expense · **This vs last month** (▲/▼ %, up = red for expense) ·
  Today · Avg/day · **Top category** · Entries.
- **By-category breakdown** list (each category + total + % bar) for the range.
- Filter row = search + category filter + **Export CSV** (all on one line).
- **Category** in Add Expense is a **MUI Autocomplete** combobox (pick or type new);
  defaults include Staff salary, Product purchase, Electricity, Fuel, **Water,
  Parcel, For Home**, Office expenses, Other.
- **Auto-populated from:** product **purchases** (single + bulk) and **worker pay**
  (salary/advance/payment/bonus/petrol/contract-work — see Workers). Plus any
  manual entries (Electricity, Fuel, Office, etc.).
- **Auto rows (🔒):** auto-created rows (Product purchase / worker categories,
  config `lockedCategories`) are marked **🔒 auto**. They can still be deleted, but
  the confirm shows a **warning** to delete from the source (purchase batch / worker
  entry) instead — so stock & worker records stay in sync. (The warning escape-hatch
  lets you clean up orphaned auto-expenses left by pre-link deletes.)
- `services/financeService.js`: `getEntries` (income also selects
  `payment_method`, `stock_tx_id`, with graceful fallbacks), `addEntry`,
  `updateEntry`, `deleteEntry`, `deleteIncomeEntry`, `deleteIncomeBatch`.

---

## 🧮 Purchase Plan (`pages/PurchasePlan.jsx`, `/purchase-plan`, admin only)

A "what to buy this month" budget analyzer. Service `getPurchasePlan({ usageDays,
bufferDays })` computes per product:
- recent **usage** (sold + used + lost over `usageDays`, default 60) → per-day rate,
- **usage-based** reorder = `perDay × bufferDays − stock`,
- **low-stock top-up** = bring stock at/below min up to `2 × min`,
- **suggested qty** = the larger of the two; **est. cost** = qty × last purchase price.
- Totals: **Suggested budget**, **Bought this month**, **Remaining to buy**
  (= suggested − bought this month), **Last month spent**.

UI: a "Keep stock for 1/2/3 months" selector (sets `bufferDays`), an "only items to
buy" toggle, the 4 budget cards, and a sorted per-product table (usage qty, low
top-up, suggested, est. cost; Low items flagged). Nav: **🧮 Buy Plan** (adminOnly).

---

## 🧩 Shared / UI components added

| File | Purpose |
|---|---|
| `theme.js` + `main.jsx` | MUI theme (indigo) + `ThemeProvider` / `LocalizationProvider` |
| `components/ui/Button.jsx` | MUI Button (variants primary/secondary/danger/ghost); `loading` prop shows a spinner + disables — used on every save/confirm button app-wide |
| `components/ui/Modal.jsx` | MUI Dialog wrapper (same `open/onClose/title/size` API) |
| `components/ui/StatCard.jsx` | MUI Paper card; accents green/red/blue/amber/indigo/purple/orange |
| `components/ui/PageHeader.jsx` | MUI Typography title row |
| `components/ui/ConfirmDialog.jsx` | Styled confirm popup; used for **all** deletes |
| `components/ui/DateRangePicker.jsx` | **Single control**: one field shows the range, opens a popover with **shortcut chips** (Today / Last 7·30 days / This·Last month / This year / Clear) + a range calendar. Free `@mui/x-date-pickers`. Exports `inRange()`, `currentMonthRange()` |
| `components/finance/LedgerPage.jsx` | Shared money ledger (Expense): range cards, month-compare, category breakdown, locked auto-rows |
| `components/products/StockLossModal.jsx` | Report loss/damage (Income + Product Details) |
| `components/products/ProductImages.jsx` | Multi-image picker (upload + camera, max 5) |
| `pages/PurchasePlan.jsx` | "What to buy this month" budget analyzer (`@mui/x-charts` not used here; uses `getPurchasePlan`) |
| `components/forms/WorkerForm.jsx` | Shared worker add/edit fields + pricing helpers |
| `components/forms/ProductForm.jsx` | Shared product add/edit fields (code + images) |
| `components/forms/VendorForm.jsx` | Shared vendor add/edit fields |
| `components/products/EditProductModal.jsx` | Shared product edit dialog |
| `components/products/ScanToSellModal.jsx` | Camera scan → record sale |

---

## 🔑 Business rules honored
1. Never edit historical transactions — only INSERT new ones (income product
   sales are an exception via `updateProductSale`, which keeps stock in sync).
2. Stock & worker balances are always computed from transactions.
3. Purchases auto-create Expenses; Sales auto-create Income; worker cash-outs
   auto-create Expenses; product loss reduces stock with no money entry.
4. Deletes always go through a confirmation dialog, and **stay consistent**:
   - Deleting a product-sale **income** (row/day) removes its stock movement → stock restored.
   - Deleting a **purchase batch** removes its stock movements + linked expense.
   - Deleting a **worker transaction** removes its linked auto-expense too.
   - Auto-created expense rows are marked 🔒 and warn before delete (prefer deleting
     from the source).
   (Cross-record consistency applies to records created after the `stock_tx_id` /
   `expense_id` link migrations; older ones degrade gracefully.)
5. Every save/confirm action shows a **loading spinner** (shared `Button` `loading`)
   and disables the button to prevent double-submits.
