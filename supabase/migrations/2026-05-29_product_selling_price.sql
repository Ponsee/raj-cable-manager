-- Selling price (what you sell the product to customers for).
-- It can differ for each purchase batch, so it is stored PER PURCHASE on
-- stock_transactions. products.selling_price caches the latest one (used to
-- pre-fill Sales). Run once in the Supabase SQL Editor (safe to re-run).

alter table products add column if not exists selling_price numeric;
alter table stock_transactions add column if not exists selling_price numeric;
