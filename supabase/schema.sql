-- =====================================================================
-- Raj Cable TV & Broadband — Database schema
-- ---------------------------------------------------------------------
-- HOW TO USE (beginner steps):
--   1. Open your project at https://supabase.com/dashboard
--   2. Left menu -> "SQL Editor" -> "New query"
--   3. Copy EVERYTHING in this file, paste it, click "Run"
--   4. You should see "Success. No rows returned"
-- It is safe to run this more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- profiles: one row per logged-in user, holds their role + approval status.
-- id matches the user id created by Supabase Auth.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  phone text,
  role text,                            -- 'admin' | 'staff' (null until approved)
  status text not null default 'pending', -- 'pending' | 'approved' | 'disabled'
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_at timestamptz default now()
);

-- workers: salary workers and contract workers.
create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,                   -- 'salary' (employee) | 'contract'
  work_type text,                       -- 'splicing' | 'wire_laying' | 'other'
  pricing jsonb,                        -- per-contractor rates, e.g. splicing {low_joint_limit,low_rate,high_rate} or wire_laying {rate_per_km}
  monthly_salary numeric default 0,
  salary_pay_day int,                   -- day of month salary is due (1-31)
  phone text,
  address text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- worker_transactions: full history (advance / work / payment).
-- We NEVER edit these rows — we only add new ones (business Rule 1).
create table if not exists worker_transactions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references workers (id) on delete cascade,
  type text not null,                   -- advance | work | salary | bonus | increment | expense
  amount numeric default 0,
  work_details jsonb,                   -- e.g. {"joints":8}, {"purpose":"Petrol"}, {"advance_reduced":500}
  calculated_amount numeric default 0,
  note text,
  payment_method text default 'Cash',   -- Cash | Online (how the pay went out)
  expense_id uuid references expenses (id) on delete set null, -- the auto-created expense (for delete sync)
  created_at timestamptz default now()
);

-- products: inventory master list.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text,                            -- easy-to-remember code, e.g. CAB001 / RTR001
  name text not null,
  category text,
  subcategory text,                     -- free-text brand/variant (e.g. TCCL, Airtel)
  product_type text,                    -- 'shop' (resale) | 'service' (materials)
  unit text,
  image_url text,                       -- primary image (first of image_urls)
  image_urls text[],                    -- all image URLs (up to ~5)
  selling_price numeric,                -- price sold to customers (pre-fills Sales)
  minimum_stock numeric default 0,
  current_stock numeric default 0,      -- legacy; stock is computed from transactions
  created_at timestamptz default now()
);

-- vendors: suppliers we buy stock from.
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  note text,
  created_at timestamptz default now()
);

-- stock_transactions: full purchase/sale history per product.
create table if not exists stock_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products (id) on delete cascade,
  type text not null,                   -- 'purchase' | 'sale' | 'usage' | 'loss'
  quantity numeric default 0,
  price_per_unit numeric default 0,    -- purchase cost (or sale price for sales)
  selling_price numeric,               -- planned selling price set with a purchase
  total_amount numeric default 0,
  discount numeric default 0,           -- bulk-order discount (on the batch's first row)
  transport numeric default 0,          -- bulk-order transport cost (on the batch's first row)
  vendor_name text,                     -- name snapshot for quick display
  vendor_id uuid references vendors (id),
  expense_id uuid references expenses (id) on delete set null, -- the purchase's expense row (for batch delete)
  note text,
  created_at timestamptz default now()
);

-- income: money coming in.
create table if not exists income (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  category text,
  note text,
  payment_method text,                  -- 'Cash' | 'Online' (how it was received)
  stock_tx_id uuid references stock_transactions (id) on delete set null, -- links a product sale to its stock movement
  created_at timestamptz default now()
);

-- expenses: money going out.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  category text,
  note text,
  payment_method text default 'Cash',   -- Cash | Online | Split
  cash_amount numeric,                   -- when Split: the cash part
  online_amount numeric,                 -- when Split: the online part
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2. INDEXES (make history lookups fast)
-- ---------------------------------------------------------------------
create index if not exists idx_worker_tx on worker_transactions (worker_id);
create index if not exists idx_stock_tx on stock_transactions (product_id);


-- ---------------------------------------------------------------------
-- 3. ROLE HELPER + SIGNUP TRIGGER
-- get_user_role(): role of the current user, but ONLY if approved.
--   (Disabling a user instantly removes their data access.)
-- set_profile_on_signup(): decides role/status when a profile is created.
--   Admin emails (edit the list) auto-approve as admin; everyone else
--   is 'pending' until an admin approves them.
-- ---------------------------------------------------------------------
create or replace function get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and status = 'approved'
$$;

create or replace function public.set_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email   text;
  admin_emails text[] := array[
    'ponseelan.11@gmail.com',
    'rajbroadbandsendamaram@gmail.com'
  ];
begin
  select email into user_email from auth.users where id = new.id;
  new.email := coalesce(new.email, user_email);
  if user_email = any (admin_emails) then
    new.role        := 'admin';
    new.status      := 'approved';
    new.approved_at := now();
  else
    new.role   := null;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_profile_on_signup on profiles;
create trigger trg_set_profile_on_signup
  before insert on profiles
  for each row execute function set_profile_on_signup();


-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- Turn it on for every table so data is protected by default.
-- ---------------------------------------------------------------------
alter table profiles            enable row level security;
alter table workers             enable row level security;
alter table worker_transactions enable row level security;
alter table products            enable row level security;
alter table vendors             enable row level security;
alter table stock_transactions  enable row level security;
alter table income              enable row level security;
alter table expenses            enable row level security;


-- ---------------------------------------------------------------------
-- 5. POLICIES
-- ---------------------------------------------------------------------

-- profiles: a user can create and read their OWN profile row.
-- Admins can read everyone (for a future "manage users" screen).
drop policy if exists "Own profile insert"  on profiles;
drop policy if exists "Own profile select"  on profiles;
drop policy if exists "Admin read profiles" on profiles;
drop policy if exists "Admin update profiles" on profiles;

create policy "Own profile insert"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Own profile select"
  on profiles for select
  using (auth.uid() = id);

create policy "Admin read profiles"
  on profiles for select
  using (get_user_role() = 'admin');

-- Admins can approve / change role / disable other users.
create policy "Admin update profiles"
  on profiles for update
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');


-- Helper note for the business tables below:
--   * admin  -> can do everything (insert/select/update/delete)
--   * staff  -> can create and view (insert + select)
--   * viewer -> can view only (select)

-- WORKERS
drop policy if exists "workers admin all"   on workers;
drop policy if exists "workers read"        on workers;
drop policy if exists "workers staff insert" on workers;
create policy "workers admin all" on workers for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "workers read" on workers for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "workers staff insert" on workers for insert
  with check (get_user_role() in ('admin','staff'));

-- WORKER TRANSACTIONS
drop policy if exists "wtx admin all"    on worker_transactions;
drop policy if exists "wtx read"         on worker_transactions;
drop policy if exists "wtx staff insert" on worker_transactions;
create policy "wtx admin all" on worker_transactions for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "wtx read" on worker_transactions for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "wtx staff insert" on worker_transactions for insert
  with check (get_user_role() in ('admin','staff'));

-- PRODUCTS
drop policy if exists "products admin all"    on products;
drop policy if exists "products read"         on products;
drop policy if exists "products staff insert" on products;
create policy "products admin all" on products for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "products read" on products for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "products staff insert" on products for insert
  with check (get_user_role() in ('admin','staff'));

-- VENDORS
drop policy if exists "vendors admin all"    on vendors;
drop policy if exists "vendors read"         on vendors;
drop policy if exists "vendors staff insert" on vendors;
create policy "vendors admin all" on vendors for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "vendors read" on vendors for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "vendors staff insert" on vendors for insert
  with check (get_user_role() in ('admin','staff'));

-- STOCK TRANSACTIONS
drop policy if exists "stx admin all"    on stock_transactions;
drop policy if exists "stx read"         on stock_transactions;
drop policy if exists "stx staff insert" on stock_transactions;
create policy "stx admin all" on stock_transactions for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "stx read" on stock_transactions for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "stx staff insert" on stock_transactions for insert
  with check (get_user_role() in ('admin','staff'));

-- INCOME
drop policy if exists "income admin all"    on income;
drop policy if exists "income read"         on income;
drop policy if exists "income staff insert" on income;
create policy "income admin all" on income for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "income read" on income for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "income staff insert" on income for insert
  with check (get_user_role() in ('admin','staff'));

-- EXPENSES
drop policy if exists "expenses admin all"    on expenses;
drop policy if exists "expenses read"         on expenses;
drop policy if exists "expenses staff insert" on expenses;
create policy "expenses admin all" on expenses for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "expenses read" on expenses for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "expenses staff insert" on expenses for insert
  with check (get_user_role() in ('admin','staff'));

-- PENDING PAYMENTS (customer credit)
create table if not exists pending_payments (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  product_id uuid references products (id) on delete set null,
  description text,
  category text,                       -- income category the paid amount books under
  total_amount numeric default 0,
  paid_amount numeric default 0,
  status text default 'open',          -- open | closed
  payment_method text default 'Cash',
  created_at timestamptz default now(),
  settled_at timestamptz
);
alter table pending_payments enable row level security;
drop policy if exists "pending admin all"    on pending_payments;
drop policy if exists "pending read"          on pending_payments;
drop policy if exists "pending staff insert"  on pending_payments;
drop policy if exists "pending staff update"  on pending_payments;
create policy "pending admin all" on pending_payments for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "pending read" on pending_payments for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "pending staff insert" on pending_payments for insert
  with check (get_user_role() in ('admin','staff'));
create policy "pending staff update" on pending_payments for update
  using (get_user_role() in ('admin','staff'))
  with check (get_user_role() in ('admin','staff'));

-- =====================================================================
-- Done. The admin emails in set_profile_on_signup() auto-approve as
-- admin when they sign up. Everyone else is 'pending' until an admin
-- approves them (and picks a role) on the in-app Users screen.
-- To change who is an admin, edit the admin_emails list above and re-run
-- the create-function statement.
-- =====================================================================
