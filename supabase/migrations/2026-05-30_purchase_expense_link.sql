-- 2026-05-30: link a purchase's stock rows to the expense they created, so
-- deleting a purchase batch can remove the stock movements AND the expense
-- together (keeping product stock, vendor history, and expenses in sync).
alter table stock_transactions
  add column if not exists expense_id uuid references expenses (id) on delete set null;

create index if not exists idx_stock_tx_expense on stock_transactions (expense_id);
