-- 2026-05-30: link each product-sale income row to its stock movement, so
-- editing the sale (quantity / price) can update BOTH the money and the stock.
alter table income
  add column if not exists stock_tx_id uuid references stock_transactions (id) on delete set null;

create index if not exists idx_income_stock_tx on income (stock_tx_id);
