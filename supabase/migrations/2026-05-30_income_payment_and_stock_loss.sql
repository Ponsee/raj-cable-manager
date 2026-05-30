-- 2026-05-30: payment method on income + stock loss support.
--
-- 1) Record HOW money came in (Cash / Online) on each income row.
alter table income
  add column if not exists payment_method text;

-- Backfill old rows so reports treat them as cash.
update income set payment_method = 'Cash' where payment_method is null;

-- 2) Stock loss needs no new table: stock_transactions.type already accepts any
--    text, so a 'loss' row (quantity out, total_amount 0, reason in note) works.
--    This index just keeps "show me all losses" lookups fast.
create index if not exists idx_stock_tx_type on stock_transactions (type);
