# Plan — Customers, Internet Connections & FTU (Free-To-Use) Modem Tracking

**Goal:** keep each customer's details and their BSNL / TIC Fiber connection
details in one place, know which modems are ours (FTU), sold or the customer's
own, and see who has not recharged for 1–2 months so the modem can be collected.

## Decisions
| Topic | Decision |
|---|---|
| Status | Tracked **per connection (provider line)**: **active / inactive / disconnected**, not per customer. The modem is linked to that connection. |
| Recharge | One field: **last recharge date**, updated by hand. Not income, no history. |
| FTU modem | Fully free, no deposit. **One modem per connection** at a time. |
| Passwords / Aadhaar | Visible to all approved users (masked, show/hide eye). Kept out of exports and messages. |
| BSNL password | Default **`password`** on every BSNL connection, editable per customer. |
| Extra fields | "+ Add field" adds to **that provider** by default. |
| Thresholds | Collect **60 days**, due-soon **30**; both editable in Settings. |
| Customer data | Customer has an **email**; connection has an **install date**. |
| Existing data | Import your **BSNL FTTH sheet** (§5). |
| Modem status | Always visible per customer: **FTU / Own / None** (§4). Imported customers start **unknown**; you set them manually. |
| Import defaults | Last recharge **blank** ("Not set") for all 102 lines. Dates are **month-first**. IP-address values in Plan Name are **dropped** (no IP field). |
| Service costs | Parcel is paid **both ways** (to the brand and back), recorded as two amounts. On an upgrade the customer's payment **can differ** from our cost. |
| Modem MAC | Printed on the box: scanned / typed when stock is added. |
| Fields | No other common fields on a connection. |

**Today's gap:** no `customers` table (only free-text `customer_name` on pending
payments), income isn't linked to a customer, and stock is only a count, so
individual modems (serial / MAC) aren't tracked.

## 1. Tables (5 new + 1 column) — migration written, see `supabase/migrations/2026-10-29_customers_connections_modems.sql`

**`customers`**: `id`, `name`, `phone`, `alt_phone`, `email`, `address`, `notes`.
Phone is **not unique** (your sheet has one mobile on different organisations).

**`providers`**: `id`, `name`, `fields` (jsonb list of
`{key, label, type, secret, required, default}`), `active`. Seeded with BSNL and
TIC; BSNL's Password field has `default: "password"`.

**`connections`** (one per internet line):
- `id`, `customer_id`, `provider_id`, `installed_on`
- Real columns (every provider has them, and they're searchable): `username`,
  `password`, `plan_name`, `plan_amount`
- `details` jsonb: provider-specific values, e.g. `{"vlan":"128","landline_no":"…","account_no":"…"}`
- `status`: `active` | `inactive` | `disconnected` (set per line, §4)
- `last_recharge_on` (**manual**, may be empty)

**`modems`** (one row per physical unit):
- `id`, `product_id` (brand / model come from the product; **optional**),
  `serial_no`, `mac_address` (each unique if set; MAC stored `AA:BB:CC:DD:EE:FF`)
- `ownership`: `ftu` (ours; collect if overdue) | `customer`
- `status`: `in_stock` | `with_customer` | `with_service` | `lost`
- `connection_id`: the line it serves (customer found through it). A **unique
  index on `connection_id` where `status = 'with_customer'`** enforces one modem
  per line.
- `issued_on`, `notice_sent_on`, `replaced_modem_id`, `purchase_tx_id` (phase 2)
- `service` jsonb (faulty units, §6): `{brand, sent_on, claim_no, for_connection_id,
  warranty, outcome, parcel_out_cost, parcel_back_cost, service_cost,
  upgrade_cost, customer_paid, expense_ids[], income_id}`
- Product / serial / MAC may be empty so a customer's modem can be recorded as
  just "FTU" or "Own" before details are known (§4).

**`income`**: nullable `connection_id` (customer found through it) for New
Internet entries. The Internet Recharge income source is unchanged.

**`app_settings`** (`key`, `value` jsonb): `ftu_due_days` = 30, `ftu_collect_days` = 60
(the app had no settings store). Read by all, changed by admin only.
**Indexes:** `connections(customer_id)`, `connections(last_recharge_on)`,
`modems(connection_id)`, `modems(status, product_id)`, `income(connection_id)`.
Update `supabase/schema.sql`; RLS like the existing tables.

**Why so few tables:** no modem-history table (current state + dates answer the
daily questions; a re-issued modem overwrites its holder, add `modem_events`
later if history is wanted); one `providers` row holds each provider's field
list and one jsonb `details` holds the values, so a new provider or field needs
no migration; only `connection_id` (no `customer_id`) on modems and income so
they can't disagree with the connection.

## 2. Provider details and connection forms
| Provider | Predefined fields |
|---|---|
| **BSNL** | User Name, Password, VLAN, VOIP Password, Landline Number, Account No, Plan Name, Static IP |
| **TIC Fiber** | User Name, Password, VLAN, Aadhaar Card Number, Plan Name |

- Picking a provider swaps the form to its fields; User Name / Password / Plan
  Name fill the real columns, the rest go to `details`. Secret fields (Password,
  VOIP Password, Aadhaar) are masked with a show/hide eye.
- **Defaults** prefill new connections (BSNL Password = `password`). Changing a
  default later does **not** overwrite existing customers.
- **"+ Add field"** (label + type text / number / date / secret) appends to that
  provider's list; tick **"Only this connection"** for a one-off.
- **Settings → Providers** (admin): add providers, rename / reorder / delete
  fields (saved values stay as "old field").
- **Add / edit / delete** customers and connections. A customer can't be deleted
  while a connection holds an FTU modem; a connection can't be deleted while a
  modem is on it. Deleting a connection keeps past income (`connection_id` → null).

## 3. Income → New Internet (customer + connection + modem in one entry)
```
New Internet
  → Customer: pick existing  OR  + New (name, phone, email, address)
  → Provider (BSNL / TIC) → its fields + Install date (default today)
  → Plan ₹ (0 ok) + Install charge ₹ (0 ok)
  → Modem: FTU (ours) | Customer bought | Own   (pick unit / MAC)
  → Payment + first recharge date → Save
       1. create customer (if new)   2. create connection
       3. assign modem (stock −1 if from stock)   4. income row(s) → connection
```
- Customer is required; the modem is always attached to that customer's new
  connection. The four steps succeed or fail together.
- **Unit picker** (FTU / Customer bought): in-stock units of the modem product,
  shown as **MAC · serial**, searchable (or scan the MAC). If the unit has no MAC,
  a MAC field appears to fill it (validated, unique).
- **FTU:** `ownership = ftu`, no income for the modem. **Customer bought:**
  `ownership = customer`, modem price added to income. **Own:** type the MAC
  (and optional serial / brand); saved as a customer-owned modem, no stock change.
- Plan / install can be 0; if the whole total is 0 the income row is skipped.
- Validation: existing customer, or new with name + phone; provider and its
  required fields; amounts filled (0 allowed).

## 4. Modem status and collection reminders
**Who has what:** every connection shows a badge 🟢 **FTU** · 🔵 **Own** ·
⚪ **None / unknown** (customer card, customer list, Modems page).
- Filter the customer list by badge, with counts on top ("FTU 38 · Own 41 · None 23").
- Set it per connection (FTU / Own / None, product and serial optional; FTU and
  Own create the modem row immediately), or **in bulk**: tick customers →
  **Set modem**. This is how the imported sheet gets classified.
- Placeholders don't touch stock; in phase 2 a real unit / serial can be linked.

**Status per connection:** one customer can have BSNL and TIC, so each line has
its own status, shown as a coloured chip on its card (🟢 Active · 🟡 Inactive ·
🔴 Disconnected) with a one-tap change.
- **Active** = in use. **Inactive** = temporarily off / not recharging.
  **Disconnected** = line closed.
- The customer's overall status is **derived**, never stored: *Active* if any
  line is active, else *Inactive* if any is inactive, else *Disconnected*. The
  customer list can filter by it and by provider ("BSNL active 71 · TIC active
  12 · BSNL disconnected 9"), and shows each line's chip next to the customer.
- The **modem is linked to the line** (`connection_id`), so it shows on that
  provider's card and follows that line's status; a customer's BSNL and TIC
  modems are tracked separately.
- When a line is set to **Inactive** or **Disconnected** and still holds an
  **FTU modem**, a prompt offers **Mark returned** (or later) and the unit goes
  to the Collect list as **"Collect now"** regardless of the recharge date.
  Setting it back to Active clears that.
- Customer-owned modems stay with the customer; Disconnected only reminds you.
- Imported customers start **Active** (change per line later, singly or in bulk).

**Recharge date:** a **Recharged** button on each connection and each reminder
row (date picker, default today) saves `last_recharge_on`; no income entry. It's
also set on New Internet, import and the edit form.

**Collect list** = FTU modems with `status = with_customer`, judged **per
connection**: any FTU modem on an **Inactive / Disconnected** line, or an Active
line judged by its `last_recharge_on`:
- older than **30 days** → amber "Due soon"; older than **60 days** → red
  "Collect modem" (both editable). Computed in the browser, no cron.
- **Empty date = "Not set"**: never flagged; has its own filter so you can fill
  it in.
- **Mark notice sent** stores the date and opens a prefilled WhatsApp / SMS
  link. **Mark returned** → unit `in_stock`. **Mark lost** can create a pending
  payment for the modem price.
- Customer-owned modems never appear here.

## 5. Import from sheet (admin only)
### Your file: `BSNL FTTH (Responses).xlsx` (Google Form export, 102 rows, all BSNL)
| Sheet column | Goes to |
|---|---|
| Timestamp | ignored |
| Name / Mobile / Email id / Address | customer name / phone / email / address |
| Date | connection **install date** |
| User name | connection username |
| Plan Name | connection plan name (cleaned, below) |
| Landline number / Account No / VLAN Id / VoIP Password / Static IP | `details` |
| MAC Address | the modem's `mac_address` (modem row created if needed) |

No password, last recharge date or modem columns exist, so: **password = BSNL
default `password`**; **last recharge date is left blank** ("Not set") and modem
status is left **unknown** for every row; you update customers manually (the
**Recharged** button and **Set modem**, single or bulk).

Cleaning rules for what the sheet contains:
- **Phone:** 9 rows blank / `-` / `_` → empty. **4 mobiles are shared by
  different names**, so customers match on **phone + name together**, never
  phone alone.
- **Plan Name:** 35 spellings kept as typed; 35 rows `-` / `_` → blank; **9 rows
  hold an IP address** → plan left blank and the IP **dropped** (not needed). The
  preview suggests a `plan_amount` where a price is obvious (e.g. 599) for you to
  accept.
- **Dates:** mixed `m/d/yy` and `m/d/yyyy`, **month first** (preselected; 9 blank).
- **Duplicates:** 1 repeated user name and 1 repeated landline → flagged
  "possible duplicate" to keep or skip. Repeated account numbers are normal
  (several lines per account), **not** duplicates.
- Landline kept as typed (spaces trimmed); address `-` / `_` → blank.

### General flow (also for the TIC sheet)
1. **Template**: one sheet per provider, columns from its field list. **Upload**,
   auto-match headers (map by hand, skip, or turn an unknown column into a new
   field on that provider; an optional `Modem` column is read).
2. **Preview** each row: new customer / existing + new connection / possible
   duplicate / error with reason. Nothing is saved yet.
3. **Confirm** → created / skipped / failed summary; failed rows download to fix
   and re-import. Safe to re-run (same provider + user name = skipped).

## 6. Faulty modems (warranty decides, costs tracked)
Kumar's modem **A** goes faulty: A → `with_service` (brand, claim no. and
`for_connection_id` in `service`); give Kumar a stock modem **B** as a temporary
FTU unit; send A to the brand and record the **parcel charges**: **to the brand** when you
send it and **back to you** when it returns (two amounts, each an expense).

| Outcome | Expense | Income | Units | In stock* |
|---|---|---|---|---|
| **Under warranty** (brand sends new unit) | Parcel (both ways) only | none | New unit C → Kumar with A's ownership; B back | 10 |
| **No warranty, repair** | Parcel (both ways) + service cost | none | A repaired → Kumar (his) or stock (ours); B back | 10 |
| **No warranty, upgrade model** | Upgrade amount we pay (+ parcel) | **Amount Kumar pays us (may differ from what we paid)** | New unit D → Kumar, `ownership = customer`; A scrapped (`lost`, "faulty"); B back | 10 |
| **No warranty, Kumar keeps FTU** | Parcel (to brand, plus back if returned) | none | B stays as FTU; A scrapped | 9 |

\*Starting with 10; it drops to 9 while B is out. A unit at the service centre
is neither in stock nor lost, it's counted as "With service".

- Cost and income are entered **separately**: the upgrade expense (what we pay the
  brand) and the customer's payment are independent amounts, so the profit or
  loss on an upgrade is visible. Parcel out and parcel back are separate expense
  rows.
- Expenses go to locked categories **Modem Parcel**, **Modem Service**, **Modem
  Upgrade**; the customer's payment to income **Modem Sale** (Cash / Online as
  elsewhere). Their ids are kept in `service`, so deleting the service entry
  removes them; the categories aren't offered in the manual expense form.
- Warranty replacements and swaps create **no purchase** and no stock income.
- If the faulty modem was customer-owned, only the service steps apply.
- A **With service** list shows each unit at the brand, days away, costs so far.

## 7. Stock ↔ modems sync (modem products only, phase 2)
In-stock count = units with `status = in_stock`.
| Stock action | Effect on `modems` |
|---|---|
| Purchase / opening stock of N | N new units `in_stock` |
| Sale to customer | unit → `with_customer`, `ownership = customer` |
| Issue as FTU | unit → `with_customer`, `ownership = ftu`, no income |
| Return / collected | unit → `in_stock`, connection cleared |
| Delete purchase / sale | linked units removed / reverted |
| Loss / write-off | unit → `lost` |

- One service function per action changes `stock_transactions` and `modems`
  together, so counts always agree.
- **Add Stock form (purchase / opening):** after the quantity, **one row per unit
  with Serial + MAC** (the MAC is printed on the box, so scan or type it as you
  unpack); both can still be left blank and completed later. You can also paste a
  column from Excel / WhatsApp. Missing ones show "details missing" on the Modems page.
- MAC accepts `:` / `-` / none, is normalised, and blocked if it exists on another
  unit. Serial and MAC are **required when issuing or selling** a unit.
- Existing stock: a one-time step creates placeholder units so counts match; the
  Products page flags any modem product whose counts differ.

## 8. UI pages
**New:** **Customers** (`/customers`: search, modem badge and status / provider
filters with counts, bulk Set modem / Set status, Import) · **Customer details** (`/customers/:id`: basic details, one card
per connection with provider, plan, install date, **status chip**, last recharge, masked
logins, provider fields, **its modem with MAC, serial, brand / model, FTU / Own
badge and a MAC copy button**; Edit / Delete / **Recharged** / + Add connection)
· **Modems** (Inventory: cards In stock / With customer / Due soon / Collect now
/ Not set / With service; search by serial / MAC / customer; issue, swap, send to
service, return, lost, notice).

**Changed:** Income → New Internet (§3) · Settings (Providers, thresholds) ·
Product Details → Add Stock (Serial + MAC rows) · Products (unit counts,
mismatch flag) · Dashboard (card "Modems out · Collect") · Expense / Income (new
modem categories).

**Popups:** add / edit customer · add / edit connection · Recharged · Import
wizard · Set modem · Issue / Swap · Send to service · Service result · Notice
sent · Returned / Lost.

## 9. Build order
**Phase 1: customers and FTU reminders (no stock coupling)**
1. Migration (tables, BSNL / TIC seed, `income.connection_id`), `schema.sql`, docs — **done**
2. Services: customers, providers, connections, modems, settings (+ `utils/ftu.js`) — **done**
3. Customers + Customer details pages: dynamic provider form, CRUD, **Recharged**
4. **Import your BSNL FTTH sheet** (§5), so real data is in early
5. Modems page: badges, bulk Set modem, collect list, notice, returned / lost
6. Dashboard card, Settings (thresholds, then Providers management)
7. Income → New Internet redesign (§3)

**Phase 2: stock and faulty flow**
8. Stock ↔ modems sync (§7), Serial + MAC rows, placeholder units, mismatch check
9. Faulty-modem flow with parcel / service / upgrade costs and "With service" (§6)

## 10. Open questions
None remaining. All questions are answered and recorded in the Decisions table.
Next step: Phase 1, step 1 (migration).
