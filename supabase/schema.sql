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

-- profiles: one row per logged-in user, holds their role.
-- id matches the user id created by Supabase Auth.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null default 'staff',   -- 'admin' | 'staff' | 'viewer'
  created_at timestamptz default now()
);

-- workers: salary workers and contract workers.
create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,                   -- 'salary' (employee) | 'contract'
  work_type text,                       -- 'splicing' | 'wire_laying' | 'other'
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
  type text not null,                   -- 'advance' | 'work' | 'payment'
  amount numeric default 0,
  work_details jsonb,                   -- e.g. {"joints": 8} or {"km": 2}
  calculated_amount numeric default 0,
  note text,
  created_at timestamptz default now()
);

-- products: inventory master list.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  unit text,
  minimum_stock numeric default 0,
  current_stock numeric default 0,
  created_at timestamptz default now()
);

-- stock_transactions: full purchase/sale history per product.
create table if not exists stock_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products (id) on delete cascade,
  type text not null,                   -- 'purchase' | 'sale'
  quantity numeric default 0,
  price_per_unit numeric default 0,
  total_amount numeric default 0,
  vendor_name text,
  note text,
  created_at timestamptz default now()
);

-- income: money coming in.
create table if not exists income (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  category text,
  note text,
  created_at timestamptz default now()
);

-- expenses: money going out.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  category text,
  note text,
  created_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2. INDEXES (make history lookups fast)
-- ---------------------------------------------------------------------
create index if not exists idx_worker_tx on worker_transactions (worker_id);
create index if not exists idx_stock_tx on stock_transactions (product_id);


-- ---------------------------------------------------------------------
-- 3. ROLE HELPER FUNCTION
-- Returns the role of the currently logged-in user.
-- SECURITY DEFINER lets it read the profiles table safely.
-- ---------------------------------------------------------------------
create or replace function get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;


-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- Turn it on for every table so data is protected by default.
-- ---------------------------------------------------------------------
alter table profiles            enable row level security;
alter table workers             enable row level security;
alter table worker_transactions enable row level security;
alter table products            enable row level security;
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

create policy "Own profile insert"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Own profile select"
  on profiles for select
  using (auth.uid() = id);

create policy "Admin read profiles"
  on profiles for select
  using (get_user_role() = 'admin');


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

-- =====================================================================
-- Done. Next: sign up your first user in the app, then come back here
-- and make yourself an admin by running (replace the email):
--
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- =====================================================================
