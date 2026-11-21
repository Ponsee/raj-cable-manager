-- Stock <-> modem units sync (phase 2 of doc/FTU_MODEM_TRACKING_PLAN.md).
-- Safe to run more than once.
--   products.track_units  -> opt in per product: keep a modem record per unit
--   modems.status 'out'   -> a unit that left stock (sold / used) without a tracked line
--   modems.out_tx_id      -> the stock movement that took the unit out, so deleting
--                            that sale / usage puts the unit back in stock

alter table products add column if not exists track_units boolean not null default false;

alter table modems drop constraint if exists modems_status_check;
alter table modems add constraint modems_status_check
  check (status in ('in_stock', 'with_customer', 'with_service', 'lost', 'out'));

alter table modems add column if not exists out_tx_id uuid
  references stock_transactions (id) on delete set null;
create index if not exists idx_modems_out_tx on modems (out_tx_id);
create index if not exists idx_modems_purchase_tx on modems (purchase_tx_id);
