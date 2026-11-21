-- Recharge expiry date per connection (entered by hand; the app pre-fills
-- last recharge + 30 days). Safe to run more than once.
alter table connections add column if not exists recharge_expires_on date;
create index if not exists idx_connections_expiry on connections (recharge_expires_on);
