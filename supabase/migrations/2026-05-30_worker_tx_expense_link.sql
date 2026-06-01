-- 2026-05-30: link a worker transaction to the expense it created, so deleting
-- the worker transaction can also remove its matching expense (keeping the
-- Expense ledger in sync).
alter table worker_transactions
  add column if not exists expense_id uuid references expenses (id) on delete set null;

create index if not exists idx_worker_tx_expense on worker_transactions (expense_id);
