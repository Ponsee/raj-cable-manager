# Plan — Modem & FTU (Free-To-Use) Tracking

Goal: know which customer holds which modem, whether it is ours (FTU) or
theirs, when the customer last recharged, who must be told / collected from
(no recharge for 1–2 months), and what happened to faulty modems.

## Current gap
The app has no `customers` table. Customers exist only as free-text
`customer_name` on `pending_payments`, and `income` rows have no customer link.
Stock is only a count (`stock_transactions`), so individual modems (serial
numbers) are not tracked.

## 1. Tables (new Supabase migration)

**Optimised to 3 new tables** (see "Why not more tables" below).

**`customers`**
- `id`, `name`, `phone`, `address`, `notes`
- No provider or recharge date here — a customer can have several connections.

**`connections`** — one row per internet line (a customer can have many, with
different providers)
- `id`, `customer_id`
- `provider` (TIC Fiber / BSNL / …)
- `subscriber_id` (provider's username / ONU ID)
- `plan_amount` (default for recharge prefill)
- `status`: `active` | `disconnected`
- `last_recharge_on` — **main field**, per connection (auto from income, or
  edited by hand)

**`modems`** — every physical modem, one row each
- `id`, `product_id` → `products` (brand/model come from the product, not
  repeated here), `serial_no` (unique when not null)
- `ownership`: `ftu` (ours; collect if they stop recharging) | `customer`
- `status`: `in_stock` | `with_customer` | `with_service` | `lost`
- `connection_id` → the line it serves (the customer is found through the
  connection; required when `with_customer`)
- `purchase_tx_id` → `stock_transactions` row that brought it in (so deleting
  a purchase can remove its units)
- `issued_on`, `notice_sent_on`, `returned_on`
- Service fields (only used for faulty units): `service_brand`,
  `service_sent_on`, `service_claim_no`,
  `service_result` (`warranty_replaced` | `rejected` | `repaired`)
- `replaced_modem_id` → the faulty modem this unit replaced (self-link)

Indexes: `modems(status, product_id)`, `modems(connection_id)`,
`connections(customer_id)`, `connections(last_recharge_on)`,
`income(connection_id)`.

### Why not more tables
- **No separate `modem_events` / loans table.** Current state plus the few date
  fields above answers every daily question (who has what, who to collect
  from, what is at service). Trade-off: a modem that is returned and re-issued
  overwrites the previous holder, so there is no full past-holder history.
  If that history is wanted later, add a small `modem_events` table then — it
  doesn't change anything above.
- **No `providers` table.** Provider is a short text list (as `INTERNET_PROVIDERS`
  today); a table is overkill until you need per-provider settings.
- **No `plans` table.** `plan_amount` on the connection is enough.
- **No `last_recharge_source` column.** Not needed to flag overdue lines.
- **`connection_id` only (no `customer_id`) on modems** avoids the two getting
  out of sync.

**`income`**: add nullable `customer_id` and `connection_id` so New Internet /
Internet Recharge entries are tied to the customer and the exact line.

Also update `supabase/schema.sql` and add RLS policies matching existing tables.

## 2. Stock ↔ modems sync (modem products only)
Products with `product_type = modem` must keep the `modems` table in step with
every stock movement. The count shown for these products = number of
`modems` rows with `status = in_stock`.

| Stock action (existing) | Effect on `modems` |
|---|---|
| Purchase / bulk purchase of N | Create N rows `in_stock` (serials entered now or filled in later) |
| Opening stock of N | Create N rows `in_stock` |
| Sale to customer | Pick a unit → `with_customer`, `ownership = customer`, `connection_id` set |
| Issue as FTU | Pick a unit → `with_customer`, `ownership = ftu`; no income |
| Return (item back to stock) | Unit → `in_stock`, `connection_id` cleared |
| Delete purchase / sale | Remove or revert the linked units |
| Write-off / loss | Unit → `lost` |

Rules:
- Each action goes through one service function so `stock_transactions` and
  `modems` change together (same pattern as the existing expense/stock links).
- Serial number is optional at purchase (bulk orders), required when issuing
  or selling to a customer.
- Existing modem stock: a one-time "create placeholder units" step so the
  counts match.
- A small reconciliation check on the Products page flags any modem product
  where the `stock_transactions` count ≠ `in_stock` units.

## 2a. Income → New Internet form (redesign)
Today `new_internet` is a "device" source: pick a product + install charge.
It becomes a customer + connection form with these sections:

1. **Customer** — search existing customers (name / phone) or "+ New
   customer" inline (name, phone, address). An existing customer simply gets
   an **additional connection**.
2. **Provider** — dropdown / autocomplete (TIC Fiber, BSNL; new ones can be
   typed and are remembered; reuses `INTERNET_PROVIDERS`). Plus the provider's
   subscriber ID / username. Saved on a new `connections` row, not on the customer.
3. **Plan amount** — number, **0 allowed** (free first month / promo).
4. **Install charge** — number, **0 allowed**.
5. **Modem** — a three-way choice:
   - **FTU modem (ours)** → pick an in-stock unit (by product / serial).
     Unit → `with_customer`, `ownership = ftu`; stock −1.
     No income for the modem itself.
   - **Customer bought modem** → pick an in-stock unit and a sell price.
     Unit → `with_customer`, `ownership = customer`; stock −1; the modem price
     is added to the income.
   - **Customer's own modem (none from us)** → no stock change, no unit
     picked. Optionally type the serial / brand for reference; saved as a
     `modems` row with `ownership = customer`, `product_id = null` so the
     customer's equipment is still on record.
6. **Payment** — Cash / Online (existing), plus the existing partial-payment
   (pending) option.
7. **Recharge date** — defaults to today; saved as the customer's
   `last_recharge_on` (the plan amount is the first recharge).

Saving creates, in one go:
- `income` row (plan + install + modem price, whichever are > 0; if the total
  is 0 the income row is skipped or saved as ₹0 — see open questions) with
  `customer_id`
- customer record (if new) and a new `connections` row with `last_recharge_on`
- modem unit update (for FTU / bought modem)

Validation: customer and provider required; amounts can be 0 but not blank;
modem choice required (default "Customer's own" so nothing is forced).

## 3. Faulty modem flow (warranty decides)
Kumar holds modem **A**, which goes faulty:
1. **A** → `with_service`, `connection_id` cleared
   (brand, warranty claim no. in note).
2. Give Kumar a stock modem **B** as a temporary replacement: B →
   `with_customer`, `ownership = ftu` ("replacing A").
3. The brand answers:
   - **Warranty OK** → new modem **C** arrives (added to `modems`, `replaced_modem_id` = A). C goes to Kumar with A's ownership; B returns to stock.
   - **No warranty** → Kumar either buys a new modem (normal sale,
     `ownership = customer`) or keeps B / another stock unit as FTU.
   - **Repaired** → A goes back to Kumar or to stock.
4. A "With service" list shows every unit at the brand and days away.

## 4. Collection reminders
Collect list = modems where `ownership = ftu` AND `status = with_customer`
AND its connection's `last_recharge_on` is older than the threshold.
A customer with two connections is judged per connection: an FTU modem on the
BSNL line is flagged if the BSNL line is overdue, even if the TIC line is current.
- > 30 days → amber "Due soon"; > 60 days → red "Collect modem"
  (thresholds configurable in Settings).
- Computed client-side, no cron.
- "Mark notice sent" stores the date; WhatsApp/SMS click-to-send link with a
  prefilled message.
- "Mark returned" → unit back `in_stock` (stock +1). "Mark lost" can create a
  pending payment for the modem price.
- Customer-owned modems never appear here.

## 5. Last recharge date
- First column in tables; drives all flags.
- Stored per connection (provider line), not per customer.
- Auto-updated when a recharge income is saved with that connection.
- Internet Recharge form: pick customer, then pick which of their connections.
- Always editable manually (existing customers, recharges done outside the app).
- Set when a connection is created (defaults to today).

## 6. UI
- **Customers** page: list, add/edit; each customer shows their connections
  (provider, plan, last recharge) and the modems on each, plus history.
- **Modems** page (sidebar → Inventory): stat cards (In stock, With customer,
  Due soon, Collect now, With service); filters by status / ownership; search
  by serial or customer; actions (issue, swap, send to service, return, lost).
- Products page: modem products show unit counts and the reconciliation flag.
- Dashboard card: "Modems out: N · Collect: M".
- Excel export via `utils/excel.js`.

## 7. Build order
1. Migration (`customers`, `connections`, `modems`, `income.customer_id` / `connection_id`) + `schema.sql` + docs
2. `customersService.js`, `connectionsService.js`, `modemsService.js`
3. Hook modem products into existing purchase / opening stock / sale / return / delete flows (section 2)
4. Customers page + optional customer picker on recharge income forms
5. Modems page: issue, swap, service, return, lost, collect list
6. Dashboard card + Excel export

## 8. Open questions
- Bulk-enter existing FTU customers and modems (quick-add form or Excel import)?
- Is the serial number always available when you buy modems, or filled in later?
- Is any refundable deposit taken, or fully free?
- Default thresholds 30 / 60 days OK?
- When warranty is rejected and the customer takes a free FTU modem, do they pay anything?
- Customer picker optional on recharge income (recommended) or required?
- New Internet with everything ₹0 (free plan, free install, FTU modem): save an
  income row of ₹0 (counts the connection) or skip income?
- Does one modem ever serve two connections, or is it always one modem per line?
