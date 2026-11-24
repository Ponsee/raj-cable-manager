-- History of collected (returned) modems: who had it, when it came back, notes.
-- Needed because a returned modem is taken off the customer's line. Safe to re-run.
create table if not exists modem_events (
  id uuid primary key default gen_random_uuid(),
  modem_id uuid references modems (id) on delete cascade,
  event text not null default 'returned',
  customer_id uuid references customers (id) on delete set null,
  customer_name text,
  customer_phone text,
  provider_name text,
  connection_id uuid references connections (id) on delete set null,
  mac_address text,
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_modem_events_modem on modem_events (modem_id);
create index if not exists idx_modem_events_date on modem_events (occurred_on desc);

alter table modem_events enable row level security;
drop policy if exists "modem_events admin all"    on modem_events;
drop policy if exists "modem_events read"         on modem_events;
drop policy if exists "modem_events staff insert" on modem_events;
create policy "modem_events admin all" on modem_events for all
  using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
create policy "modem_events read" on modem_events for select
  using (get_user_role() in ('admin','staff','viewer'));
create policy "modem_events staff insert" on modem_events for insert
  with check (get_user_role() in ('admin','staff'));
