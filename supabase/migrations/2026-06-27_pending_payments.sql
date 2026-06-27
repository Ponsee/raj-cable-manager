-- Pending payments / customer credit ("khata"): a customer paid part now and
-- owes the rest. Income records only what was actually received; the balance
-- (total_amount - paid_amount) is tracked here until collected.
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

-- If the table already existed (created before this column), add it.
alter table pending_payments add column if not exists category text;

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
-- Staff need update so they can record a collection (settle the balance).
create policy "pending staff update" on pending_payments for update
  using (get_user_role() in ('admin','staff'))
  with check (get_user_role() in ('admin','staff'));
