# Raj Cable Manager — Module Reference (Workers · Products · Vendors)

Last updated: 2026-05-29. This documents the features built so far in the
**Workers**, **Products**, and **Vendors** modules, plus the setup steps
(migrations / Supabase config) needed for them to work.

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

**Storage:** create a **public** bucket named **`product-images`**
(Storage → New bucket → Public: ON) for product photo uploads.

**npm packages added:** `qrcode.react`, `html5-qrcode` (run `npm install` if pulling fresh).

> `schema.sql` is the full fresh-setup script and already includes all of the above.

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

### UI
- Add Transaction: type buttons on one responsive row; auto-filled note for every type.
- One reusable `HistoryModal` per stat card (Salary / Bonus / Increment / Advance /
  Balance reduction / Expense), each with its **own** date range (independent of the page).
- Stat cards per type (incl. **Total Expense** ⛽). Transaction history has inner
  scroll + sticky header. Workers list "Balance Due" matches the details page.

---

## 📦 Products module

### Product fields
- `name`, `product_type` (**Shop** / **Service material**), `category`,
  `subcategory` (free-text brand, e.g. TCCL/Airtel), `unit`, `selling_price`,
  `minimum_stock` (low-stock alert), `image_url`.
- **Category** is an add-new combobox (defaults + used categories + "➕ Add new…").
- **Subcategory** is free-text with auto-suggestions.
- **Image** uploaded to Supabase Storage (`product-images` bucket).
- Add/Edit use shared `components/forms/ProductForm.jsx`; edit dialog is the shared
  `components/products/EditProductModal.jsx` (used by both list and details).

### Stock (always computed — Business Rule 2)
- `utils/productCalc.js → calcStock(txs)`: stock = purchased − sold − used; also
  returns purchase/sale value, last purchase price, stock value, usedQty.
- `isLowStock(stock, min)`, `pricesByVendor(txs)` (cheapest-first vendor comparison).

### Stock entry types (`stock_transactions.type`)
- **Purchase** 🛒 — stock in; creates an **Expense**; per-batch **selling price**;
  pick a **vendor**.
- **Sale** 💰 — stock out; creates an **Income**; pre-filled from selling price;
  blocked if it exceeds available stock.
- **Used in service** 🔧 — stock out, **no income** (materials consumed on a job).

### Selling price (per purchase batch)
- Stored per purchase on `stock_transactions.selling_price` (can differ each batch).
- `products.selling_price` caches the **latest** one; pre-fills Sales + Scan-to-Sell.
- Editable directly in the product form; shown in the profile + stock history
  (`· sell @ ₹X`).

### Price by vendor
- Product details shows each vendor's **lowest + latest** purchase price for that
  product, cheapest first (green "cheapest" tag).

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
- **Purchase history**: **By batch** view (one bulk order = one batch block with
  its total) or **All items**, plus a **date-range filter**.

---

## 🧩 Shared / UI components added

| File | Purpose |
|---|---|
| `components/ui/ConfirmDialog.jsx` | Styled confirm popup; used for **all** deletes |
| `components/ui/DateRangePicker.jsx` | Reusable date range + `inRange()` helper |
| `components/forms/WorkerForm.jsx` | Shared worker add/edit fields + pricing helpers |
| `components/forms/ProductForm.jsx` | Shared product add/edit fields |
| `components/forms/VendorForm.jsx` | Shared vendor add/edit fields |
| `components/products/EditProductModal.jsx` | Shared product edit dialog |
| `components/products/ScanToSellModal.jsx` | Camera scan → record sale |
| `components/ui/StatCard.jsx` | Accents: green/red/blue/amber/indigo/purple/orange |

---

## 🔑 Business rules honored
1. Never edit historical transactions — only INSERT new ones.
2. Stock & worker balances are always computed from transactions.
3. Purchases auto-create Expenses; Sales auto-create Income.
4. Deletes always go through a confirmation dialog.
