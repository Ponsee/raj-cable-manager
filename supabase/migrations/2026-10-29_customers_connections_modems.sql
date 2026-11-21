-- Customers, internet connections (per provider), providers, modems, settings.
-- Phase 1 of doc/FTU_MODEM_TRACKING_PLAN.md. Safe to run more than once.
--   customers   -> the person (phone is NOT unique)
--   providers   -> BSNL / TIC Fiber ... with the form fields each one needs
--   connections -> one internet line of a customer (status + last recharge here)
--   modems      -> one row per physical modem, linked to a connection
--   app_settings-> small key/value settings (FTU reminder thresholds)

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,                           -- not unique: one mobile can serve several names
  alt_phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_customers_name  on customers (lower(name));
create index if not exists idx_customers_phone on customers (phone);

-- ---------------------------------------------------------------------
-- providers: each provider's form fields live in `fields` (jsonb list of
-- {key,label,type,secret,required,default,column}). `column` marks fields that
-- map to a real connections column (username / password / plan_name); every other
-- field's value is stored in connections.details under its key.
-- ---------------------------------------------------------------------
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fields jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz default now()
);

insert into providers (name, fields) values
  ('BSNL', '[
    {"key":"username","label":"User Name","type":"text","required":true,"column":"username"},
    {"key":"password","label":"Password","type":"secret","secret":true,"required":true,"default":"password","column":"password"},
    {"key":"vlan","label":"VLAN","type":"text"},
    {"key":"voip_password","label":"VOIP Password","type":"secret","secret":true},
    {"key":"landline_no","label":"Landline Number","type":"text"},
    {"key":"account_no","label":"Account No","type":"text"},
    {"key":"plan_name","label":"Plan Name","type":"text","column":"plan_name"},
    {"key":"static_ip","label":"Static IP","type":"text"}
  ]'::jsonb),
  ('TIC Fiber', '[
    {"key":"username","label":"User Name","type":"text","required":true,"column":"username"},
    {"key":"password","label":"Password","type":"secret","secret":true,"required":true,"column":"password"},
    {"key":"vlan","label":"VLAN","type":"text"},
    {"key":"aadhaar_no","label":"Aadhaar Card Number","type":"secret","secret":true},
    {"key":"plan_name","label":"Plan Name","type":"text","column":"plan_name"}
  ]'::jsonb)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- connections: one internet line. Status is per line, not per customer.
-- last_recharge_on is the only recharge data (updated by hand, may be empty).
-- ---------------------------------------------------------------------
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  provider_id uuid not null references providers (id),
  username text,
  password text,
  plan_name text,
  plan_amount numeric,
  installed_on date,
  details jsonb not null default '{}'::jsonb,   -- provider-specific values keyed by field key
  status text not null default 'active'
    check (status in ('active', 'inactive', 'disconnected')),
  last_recharge_on date,
  created_at timestamptz default now()
);
create index if not exists idx_connections_customer on connections (customer_id);
create index if not exists idx_connections_provider on connections (provider_id);
create index if not exists idx_connections_recharge on connections (last_recharge_on);
create index if not exists idx_connections_username on connections (provider_id, username);

-- ---------------------------------------------------------------------
-- modems: one row per physical unit. product / serial / MAC are optional so a
-- customer's modem can be recorded as just "FTU" or "own" first.
-- ---------------------------------------------------------------------
create table if not exists modems (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products (id) on delete set null,
  serial_no text,
  mac_address text
    check (mac_address is null or mac_address ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$'),
  ownership text not null default 'ftu'
    check (ownership in ('ftu', 'customer')),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'with_customer', 'with_service', 'lost')),
  -- The line it serves. RESTRICT: a connection (or its customer) can't be deleted
  -- while a modem is still on it.
  connection_id uuid references connections (id) on delete restrict,
  issued_on date,
  notice_sent_on date,
  replaced_modem_id uuid references modems (id) on delete set null,
  purchase_tx_id uuid references stock_transactions (id) on delete set null,
  service jsonb,                        -- faulty-unit details (brand, claim, parcel / service / upgrade costs ...)
  created_at timestamptz default now(),
  check (status <> 'with_customer' or connection_id is not null)
);
create unique index if not exists uq_modems_serial on modems (serial_no) where serial_no is not null;
create unique index if not exists uq_modems_mac    on modems (mac_address) where mac_address is not null;
-- One modem per line at a time.
create unique index if not exists uq_modems_one_per_line
  on modems (connection_id) where status = 'with_customer';
create index if not exists idx_modems_connection on modems (connection_id);
create index if not exists idx_modems_status_product on modems (status, product_id);

-- ---------------------------------------------------------------------
-- income: tie a New Internet entry to its line (customer found through it).
-- ---------------------------------------------------------------------
alter table income add column if not exists connection_id uuid
  references connections (id) on delete set null;
create index if not exists idx_income_connection on income (connection_id);

-- ---------------------------------------------------------------------
-- app_settings: key/value settings (FTU reminder thresholds, in days).
-- ---------------------------------------------------------------------
create table if not exists app_settings (
  key text primary key,
  value jsonb not null
);
insert into app_settings (key, value) values
  ('ftu_due_days', '30'::jsonb),
  ('ftu_collect_days', '60'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Row level security (same pattern as the other tables): everyone approved can
-- read; admin + staff can add and edit; only admin can delete / change settings.
-- ---------------------------------------------------------------------
alter table customers    enable row level security;
alter table providers    enable row level security;
alter table connections  enable row level security;
alter table modems       enable row level security;
alter table app_settings enable row level security;

drop policy if exists "customers admin all"    on customers;
drop policy if exists "customers read"         on customers;
drop policy if exists "customers staff insert" on customers;
drop policy if exists "customers staff update" on customers;
create policy "customers admin all" on customers for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "customers read" on customers for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "customers staff insert" on customers for insert
  with check (get_user_role() in ('admin','staff'));
create policy "customers staff update" on customers for update
  using (get_user_role() in ('admin','staff')) with check (get_user_role() in ('admin','staff'));

drop policy if exists "connections admin all"    on connections;
drop policy if exists "connections read"         on connections;
drop policy if exists "connections staff insert" on connections;
drop policy if exists "connections staff update" on connections;
create policy "connections admin all" on connections for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "connections read" on connections for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "connections staff insert" on connections for insert
  with check (get_user_role() in ('admin','staff'));
create policy "connections staff update" on connections for update
  using (get_user_role() in ('admin','staff')) with check (get_user_role() in ('admin','staff'));

drop policy if exists "modems admin all"    on modems;
drop policy if exists "modems read"         on modems;
drop policy if exists "modems staff insert" on modems;
drop policy if exists "modems staff update" on modems;
create policy "modems admin all" on modems for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "modems read" on modems for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "modems staff insert" on modems for insert
  with check (get_user_role() in ('admin','staff'));
create policy "modems staff update" on modems for update
  using (get_user_role() in ('admin','staff')) with check (get_user_role() in ('admin','staff'));

-- providers: staff may update (the "+ Add field" button appends to the list).
drop policy if exists "providers admin all"    on providers;
drop policy if exists "providers read"         on providers;
drop policy if exists "providers staff update" on providers;
create policy "providers admin all" on providers for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "providers read" on providers for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "providers staff update" on providers for update
  using (get_user_role() in ('admin','staff')) with check (get_user_role() in ('admin','staff'));

drop policy if exists "app_settings admin all" on app_settings;
drop policy if exists "app_settings read"      on app_settings;
create policy "app_settings admin all" on app_settings for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "app_settings read" on app_settings for select
  using (get_user_role() in ('admin','staff','viewer'));
