-- Vendors module + link each purchase to a vendor.
-- Run once in the Supabase SQL Editor (safe to re-run).

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  note text,
  created_at timestamptz default now()
);

-- Link purchases to a vendor (vendor_name is still kept for quick display).
alter table stock_transactions add column if not exists vendor_id uuid references vendors (id);
create index if not exists idx_stock_tx_vendor on stock_transactions (vendor_id);

-- RLS (same pattern as the other tables).
alter table vendors enable row level security;
drop policy if exists "vendors admin all"    on vendors;
drop policy if exists "vendors read"         on vendors;
drop policy if exists "vendors staff insert" on vendors;
create policy "vendors admin all" on vendors for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "vendors read" on vendors for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "vendors staff insert" on vendors for insert
  with check (get_user_role() in ('admin','staff'));
