-- Split payment: when an expense was paid part Cash + part Online, payment_method
-- is 'Split' and these hold the breakdown (cash_amount + online_amount = amount).
-- For plain Cash/Online rows these stay null.
alter table expenses
  add column if not exists cash_amount numeric,
  add column if not exists online_amount numeric;
