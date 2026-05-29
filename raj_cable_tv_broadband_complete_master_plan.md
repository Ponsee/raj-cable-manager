# 📘 Raj Cable TV & Broadband — Complete Master Product Plan

---

# 🧠 Project Vision

Build a complete business management system for:

- Raj Cable TV And Broadband
- Inventory / Stock management
- Staff salary tracking
- Contract worker tracking
- Income & Expense management
- Dashboard & Reports
- Role-based multi-user access
- Long-term scalable architecture

This system should:

- Work on desktop + mobile
- Be easy to maintain
- Use free hosting + free database initially
- Be production-ready
- Support future scaling

---

# 🏗️ Tech Stack

## Frontend

- React (Vite)
- Tailwind CSS
- React Router
- Context API
- Recharts (charts)
- React Hook Form (later)
- Zod validation (later)

---

## Backend

- Supabase
  - PostgreSQL
  - Authentication
  - Row Level Security (RLS)
  - Storage (future)

---

## Deployment

| Service | Purpose | Free Plan |
|---|---|---|
| Vercel | Frontend Hosting | ✅ |
| Supabase | Database + Auth | ✅ |

---

# 🔐 Authentication & Roles

## Login Method

- Email + Password

---

## Role System

| Role | Access |
|---|---|
| admin | Full access |
| staff | Create + View |
| viewer | View only |

---

# 📱 Application Modules

1. Authentication
2. Dashboard
3. Workers Management
4. Contract Work Management
5. Products & Inventory
6. Income Management
7. Expense Management
8. Reports & Export
9. Settings

---

# 📁 Final Frontend Structure

```txt
src/
 ├── pages/
 │     ├── Login.jsx
 │     ├── Dashboard.jsx
 │     ├── Workers.jsx
 │     ├── WorkerDetails.jsx
 │     ├── Products.jsx
 │     ├── ProductDetails.jsx
 │     ├── Income.jsx
 │     ├── Expense.jsx
 │     ├── Reports.jsx
 │     └── Settings.jsx
 │
 ├── components/
 │     ├── layout/
 │     ├── forms/
 │     ├── tables/
 │     ├── charts/
 │     └── ui/
 │
 ├── services/
 │     ├── supabase.js
 │     ├── workersService.js
 │     ├── productsService.js
 │     ├── incomeService.js
 │     └── expenseService.js
 │
 ├── context/
 │     └── AuthContext.jsx
 │
 ├── hooks/
 ├── utils/
 └── constants/
```

---

# 🗃️ Database Design

---

# 1️⃣ profiles

Purpose:
- Store role and user details

```sql
create table profiles (
  id uuid primary key,
  name text,
  role text default 'staff',
  created_at timestamp default now()
);
```

---

# 2️⃣ workers

Purpose:
- Store salary workers
- Store contract workers

```sql
create table workers (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text,                 -- 'salary' (Employee) | 'contract'
  work_type text,            -- 'splicing' | 'wire_laying' | 'other'
  pricing jsonb,             -- per-contractor rates (added 2026-05-29)
  monthly_salary numeric,
  salary_pay_day int,        -- day 1-31 salary is due (added 2026-05-22)
  phone text,
  address text,
  is_active boolean default true,
  created_at timestamp default now()
);
```

---

# 3️⃣ worker_transactions

Purpose:
- Full history (never edited; only inserted — Business Rule 1)
- type: advance | work | salary | bonus | increment | expense (free text)

```sql
create table worker_transactions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references workers(id) on delete cascade,
  type text,                 -- advance|work|salary|bonus|increment|expense
  amount numeric,
  work_details jsonb,        -- {joints,advance_reduced,net} | {purpose} | {salary_date,leave_days,...}
  calculated_amount numeric, -- work earned / new salary; 0 for advance & expense
  note text,
  created_at timestamp default now()
);
```

---

# 4️⃣ products

Purpose:
- Product master table

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  name text,
  category text,
  unit text,
  minimum_stock numeric default 0,
  current_stock numeric default 0,
  created_at timestamp default now()
);
```

---

# 5️⃣ stock_transactions

Purpose:
- Full stock history
- Purchase history
- Vendor history
- Price history

```sql
create table stock_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  type text,
  quantity numeric,
  price_per_unit numeric,
  total_amount numeric,
  vendor_name text,
  note text,
  created_at timestamp default now()
);
```

---

# 6️⃣ income

```sql
create table income (
  id uuid primary key default gen_random_uuid(),
  amount numeric,
  category text,
  note text,
  created_at timestamp default now()
);
```

---

# 7️⃣ expenses

```sql
create table expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric,
  category text,
  note text,
  created_at timestamp default now()
);
```

---

# ⚡ Indexes

```sql
create index idx_worker_tx on worker_transactions(worker_id);
create index idx_stock_tx on stock_transactions(product_id);
```

---

# 🔐 Row Level Security (RLS)

Enable RLS:

```sql
alter table profiles enable row level security;
alter table workers enable row level security;
alter table worker_transactions enable row level security;
alter table products enable row level security;
alter table stock_transactions enable row level security;
alter table income enable row level security;
alter table expenses enable row level security;
```

---

# 🔐 Role Function

```sql
create or replace function get_user_role()
returns text
language sql
stable
as $$
  select role from profiles where id = auth.uid()
$$;
```

---

# 🔐 Policies

## Workers

```sql
create policy "Admin full workers"
on workers
for all
using (get_user_role() = 'admin');

create policy "Staff workers read"
on workers
for select
using (get_user_role() in ('admin','staff','viewer'));
```

---

# 📄 PAGE-WISE COMPLETE FLOW

---

# 🔑 Login / Signup Page

## Features

- Login
- Signup
- Logout
- Session persistence

---

## UI

- Center card
- Mobile responsive
- Toggle Login / Signup
- Password hidden
- Loading state
- Error messages

---

## Flow

Signup:
1. Create auth user
2. Create profile row
3. Assign role
4. Redirect dashboard

Login:
1. Verify credentials
2. Load session
3. Fetch role
4. Redirect dashboard

---

# 📊 Dashboard Page

## Purpose

Show current business summary.

---

## Top Tiles

| Tile | Data |
|---|---|
| Total Income | Current month |
| Total Expense | Current month |
| Profit | Income - Expense |
| Pending Salary | Worker pending |
| Low Stock | Products below limit |

---

## Charts

### 1. Income vs Expense
- Monthly bar chart

### 2. Expense Breakdown
- Pie chart

### 3. Product Purchases
- Monthly trend

---

## Recent Activities

Show latest:
- Worker payments
- Product purchases
- Income entries
- Expenses

---

# 👷 Workers Page

## Purpose

Manage:
- Salary workers
- Contract workers

---

## Features

- Add worker
- Edit worker
- Disable worker
- Search worker
- Filter by type

---

## Worker Types

| Type |
|---|
| salary |
| contract |

---

## Work Types

| Work Type |
|---|
| splicing |
| wire_laying |
| other |

---

## Table Columns

- Name
- Type
- Work Type
- Current Balance
- Last Payment
- Actions

---

# 👤 Worker Details Page

MOST IMPORTANT MODULE

---

# Sections

1. Worker Profile
2. Add Transaction
3. Salary Summary
4. Full History

---

# Transaction Types

| Type | Meaning |
|---|---|
| advance | Money given before work/salary |
| work | Work entry |
| payment | Salary/payment paid |

---

# 🟡 Advance Flow

Scenario:
- Worker asks money before salary.

Flow:
1. Enter advance amount
2. Stored in transactions
3. Reduces final payable amount

---

# 🔵 Salary Worker Flow

Example:
- Monthly salary = 20,000
- Advance = 5,000

Final payable:

```txt
20,000 - 5,000 = 15,000
```

---

# 🔵 Contract Worker Flow

---

# Splicing Logic

Rule:

```txt
<= 4 joints → 100 per joint
>= 5 joints → 90 per joint
```

---

## Example

### 3 joints

```txt
3 × 100 = 300
```

### 8 joints

```txt
8 × 90 = 720
```

---

# Wire Laying Logic

Rule:

```txt
1 KM = 3500
```

---

## Example

```txt
2 KM × 3500 = 7000
```

---

# Other Work Types

Future support:
- Pole work
- Maintenance
- Installation
- Fiber fixing

---

# Worker Balance Formula

```txt
balance = total_work_amount - total_payment - total_advance
```

---

# Worker History

Show full history:

| Date | Type | Amount | Note |
|---|---|---|---|

---

# 📦 Products Page

## Purpose

Inventory management.

---

## Features

- Add product
- Edit product
- Search product
- View stock
- Low stock alerts

---

## Product Categories

Examples:
- Cable
- Connector
- ONU
- Router
- Fiber
- Splitter

---

## Product Table

| Column |
|---|
| Product Name |
| Category |
| Current Stock |
| Last Purchase Price |
| Actions |

---

# 📦 Product Details Page

IMPORTANT MODULE

---

# Features

- Add purchase
- Add sale
- Stock history
- Vendor history
- Price history

---

# Purchase Flow

Fields:
- Quantity
- Price per unit
- Vendor name
- Note

---

## Logic

```txt
stock += quantity
```

Expense created automatically.

---

# Sale Flow

Fields:
- Quantity
- Selling price

---

## Logic

```txt
stock -= quantity
```

Income created automatically.

---

# Full History

Show:
- Purchase entries
- Sale entries
- Vendor names
- Price changes

---

# 🟢 Income Page

## Features

- Add income
- Filter by date
- Search
- Export

---

## Categories

Examples:
- Recharge
- New connection
- Installation
- Product sales

---

# 🔴 Expense Page

## Features

- Add expense
- Filter
- Export

---

## Categories

Examples:
- Staff salary
- Product purchase
- Electricity
- Fuel
- Office expenses

---

# 📊 Reports Page

## Purpose

Export and analytics.

---

# Export Types

| Report |
|---|
| Income |
| Expense |
| Worker history |
| Product history |
| Stock report |

---

## Export Formats

- CSV
- Excel (future)
- PDF (future)

---

# ⚠️ VALIDATIONS

---

# Authentication

- Email valid
- Password minimum 6 chars

---

# Workers

- Amount cannot be negative
- Worker required

---

# Products

- No negative stock
- Product name unique

---

# Transactions

- Quantity > 0
- Amount > 0

---

# 🧠 IMPORTANT BUSINESS RULES

---

# Rule 1

Never update historical transactions.

Always insert new transaction.

---

# Rule 2

Stock always calculated from transactions.

---

# Rule 3

Worker balance always dynamic.

---

# Rule 4

All financial entries should have history.

---

# 🔄 Future Features

- Notifications
- WhatsApp reminders
- Customer management
- Invoice system
- Mobile app
- Barcode scanning
- Multi-shop support
- Backup system

---

# 🚀 Development Phases

---

# Phase 0

- React setup
- Tailwind setup
- Git init
- Supabase setup

---

# Phase 1

- Database
- Tables
- RLS
- Roles

---

# Phase 2

- Authentication
- Protected routes
- Session handling

---

# Phase 3

- Workers module
- Salary logic
- Advance logic
- Contract logic

---

# Phase 4

- Products module
- Stock tracking
- Purchase history

---

# Phase 5

- Income & Expense module

---

# Phase 6

- Dashboard
- Charts
- Analytics

---

# Phase 7

- Reports
- Export system

---

# Phase 8

- UI polishing
- Performance optimization
- Mobile optimization

---

# 📦 Deployment Plan

---

# Frontend

Deploy using:
- Vercel

---

# Backend

Use:
- Supabase free plan

---

# Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

# 🧪 Testing Plan

---

# Authentication Testing

- Signup
- Login
- Logout
- Role fetch

---

# Worker Testing

- Add worker
- Add advance
- Add payment
- Balance calculation

---

# Product Testing

- Add product
- Add stock
- Sale
- Prevent negative stock

---

# Dashboard Testing

- Correct totals
- Correct charts

---

# 🏁 Final Goal

After completion this system should:

✅ Handle entire shop management
✅ Track complete stock history
✅ Track salary + advances
✅ Track contract work payments
✅ Provide analytics dashboard
✅ Be scalable for future business growth
✅ Work professionally in production

---

# 📌 Final Notes

This architecture is designed to:

- Start free
- Scale later
- Maintain proper code structure
- Avoid data inconsistency
- Support future features easily

---


---

# 📝 IMPLEMENTATION UPDATES (May 2026)

---

# 👤 Worker Details Page - Updated

### Transaction Types

> NOTE: This "IMPLEMENTATION UPDATES" section reflects the ACTUAL current
> behaviour (last updated 2026-05-29) and SUPERSEDES the original plan sections
> above wherever they differ (transaction types, balance formula, contractor
> work, etc.).

#### Employee (salary) — 5 transaction types

| Type | Meaning |
|---|---|
| salary | Monthly salary payout (net of leave + advance reduced) |
| advance | Cash given early; reduced from a later salary |
| bonus | Extra one-time payment (NOT deducted) |
| increment | Raise; updates stored monthly_salary going forward |
| expense | Petrol/other money given for work — NOT deducted from pay |

#### Contract worker — 4 transaction types (splicing only for now)

| Type | Meaning |
|---|---|
| work | Splicing, paid per joint; can settle advance at entry (net to pay) |
| advance | Cash given early; settled later from a work payout |
| bonus | Extra one-time payment (NOT deducted) |
| expense | Petrol/other money given for work — NOT deducted from pay |

The contractor **payment** type was REMOVED — paying happens through the Work
entry (gross − advance reduced = net to pay). `worker_transactions.type` is free
text (no DB constraint), so advance/work/salary/bonus/increment/expense are all
valid. Wire-laying / custom contractor work is not exposed in the UI for now
(splicing only) though `calcWireLaying` and the pricing schema still support it.

---

# 💰 Salary Worker Transaction Modal

### Salary Transaction Fields

| Field | Description |
|---|---|
| Date | Salary payment date |
| Advance to reduce (₹) | How much of the outstanding advance to settle now |
| Leave days (deducted) | Days of leave taken |
| Note | Auto-generated (editable) |

A live breakdown box shows: Monthly salary, Current advance, Leave deduction,
Reduce from advance, and the final Net salary to pay.

### Net Salary Calculation

```
Daily Rate = Monthly Salary / 30
Net Salary = Monthly Salary - (Leave Days × Daily Rate) - Advance to Reduce
```

### Auto Note Generation

The note auto-fills from the entered values for EVERY type, both worker kinds:
- salary → "May 2026, 2 day leave, Advance reduced: ₹5,000"
- advance → "Advance: ₹5,000"
- bonus → "May 2026, Bonus: ₹2,000"
- increment → "Increment: ₹20,000 → ₹25,000"
- work (contractor) → "8 joints, Advance reduced: ₹500, Net paid: ₹220"
- expense → "Petrol, ₹500"

---

# 💰 Bonus & Increment

## Bonus Transaction

| Field | Description |
|---|---|
| Date | Bonus payment date |
| Bonus Amount | Bonus amount |

## Increment Transaction

Added from the MAIN Add Transaction form (the old "+" button on the card was
removed). Records old → new salary AND updates the worker's stored
`monthly_salary` going forward. The Increment card opens its history (read-only).

## Expense Transaction (employee + contractor)

Petrol / Food / Travel / Material / Other money GIVEN to a worker for work.
It is recorded for tracking only — it is NOT deducted from salary/work pay and
never affects Balance Due (`calculated_amount = 0`, `work_details = {purpose}`).
This was a deliberate choice ("never deduct petrol").

---

# 📊 Worker Summary Cards

## Employee Cards (6 cards)

| Card | Icon | Click Action |
|---|---|---|
| Total Salary | 💰 | Opens Salary History |
| Total Bonus | 🎁 | Opens Bonus History |
| Increment | 📈 | Opens Increment History (shows last raise) |
| Total Advance | 💵 | Opens Advance History |
| Balance Due | ⚖️ | Opens Balance Reduction History |
| Total Expense | ⛽ | Opens Expense History |

## Contract Worker Cards (5 cards)

| Card | Icon | Click Action |
|---|---|---|
| Total Work | 🛠️ | - |
| Total Bonus | 🎁 | Opens Bonus History |
| Total Advance | 💵 | Opens Advance History (shows OUTSTANDING advance) |
| Balance Due | ⚖️ | Opens Balance Reduction History |
| Total Expense | ⛽ | Opens Expense History |

For a contractor, Total Advance and Balance Due are the same number (the
outstanding advance), because work is paid in full at entry.

---

# 📋 History Modals

There is ONE reusable `HistoryModal` component. Each open modal keeps its OWN
date range (defaults to earliest matching entry → today) that is INDEPENDENT of
the page's transaction-history filter — changing the range in a modal never
affects the page. Used for:
- Advance History
- Salary History
- Bonus History
- Increment History
- Balance Reduction History (entries where an advance was reduced, salary OR work)
- Expense History

---

# 🔑 Worker Balance Formula (Updated)

`calcBalance(transactions, workerType)` takes the worker type and branches.
Advance reductions are read from `work_details.advance_reduced` on ANY entry
(salary or work). Expense entries never affect balance.

## Employee

```
Balance Due = max(0, Total Advance Given − Total Advance Reduced by Salary)
```

Represents the advance the worker still owes / that is still outstanding.

## Contract Worker

```
Balance Due = max(0, Total Advance Given − Total Advance Reduced by Work)
```

Because work is paid in full when recorded (gross − advance reduced = net paid),
the only running balance is the outstanding advance. `Total Advance` shows this
same outstanding value, so it DROPS after a work payout settles an advance.

---

# 🛠️ Contract Worker Work Entry (splicing per joint)

- Enter number of joints → gross = joints × per-joint rate (from worker pricing).
- Optional "Advance to reduce (₹)" (only shows if advance outstanding; capped at it).
- Breakdown: Work earned, Current advance, Reduce from advance, Net to pay.
- Saved as `work_details = { work_type:"splicing", joints, advance_reduced, net }`.

# 💵 Per-Contractor Pricing

`workers.pricing` (jsonb) stores each contractor's own rates:
- splicing → `{ low_joint_limit, low_rate, high_rate }` (defaults 4 / 100 / 90)
- wire_laying → `{ rate_per_km }` (default 3500)

Editable in the Add/Edit Worker form (shows fields based on chosen work type).
`calcSplicing(joints, pricing)` / `calcWireLaying(km, pricing)` use the worker's
pricing and fall back to the global defaults. The profile shows a plain-English
summary, e.g. "Up to 4 joints: ₹100 per joint. More than 4 joints: ₹90 per joint."

# ✏️ Add / Edit Worker Form

Add and Edit both use the shared `components/forms/WorkerForm.jsx` (same layout).
Editable fields: name, type (Employee/Contract — DB stores salary/contract),
work_type + pricing (contract), monthly_salary + salary_pay_day 1–31 (employee),
phone, address. Helpers: `buildPricing`, `pricingToFormFields`,
`DEFAULT_PRICING_FORM`.

# 📋 Workers List

`getWorkersWithBalance()` joins transactions, selects `work_details`, and calls
`calcBalance(txs, w.type)` so the list "Balance Due" column matches each worker's
details page exactly.

# 🗄️ DB Columns Added (run in Supabase SQL Editor)

- `workers.salary_pay_day int`  → migrations/2026-05-22_add_salary_pay_day.sql
- `workers.pricing jsonb`        → migrations/2026-05-29_add_worker_pricing.sql
- No migration needed for the `expense` type (worker_transactions.type is free text).

---

# 🧩 StatCard Component

Supports:
- `onClick` - makes the card a clickable button (opens a history modal)
- `children` - optional content inside the card
- `accent` - green / red / blue / amber / indigo / purple / orange

# 📱 UI / Responsiveness

- Add Transaction modal is wide (`size="lg"`); type buttons use a responsive
  grid (employee 5, contractor 4) — one row on desktop, wraps on mobile.
- Transaction History has an inner scroll (`max-h`) with a sticky header.
- Date range pickers wrap on small screens; layout is mobile-first.

