-- 2026-05-30: remember per-order discount & transport on bulk purchases so the
-- vendor purchase history can show them. Stored on the FIRST row of each batch
-- (others stay 0), so summing across a batch gives the right total.
alter table stock_transactions add column if not exists discount numeric default 0;
alter table stock_transactions add column if not exists transport numeric default 0;
