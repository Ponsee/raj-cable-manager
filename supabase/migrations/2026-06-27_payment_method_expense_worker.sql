-- Record how worker pay / expenses went out: Cash or Online (GPay/PhonePe/UPI).
-- Mirrors income.payment_method. Defaults to 'Cash' for existing rows.
alter table expenses
  add column if not exists payment_method text default 'Cash';

alter table worker_transactions
  add column if not exists payment_method text default 'Cash';
