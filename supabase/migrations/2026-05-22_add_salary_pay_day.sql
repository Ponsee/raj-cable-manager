-- Adds the "salary pay day" column to the workers table.
-- Run this once in the Supabase SQL Editor if your workers table already
-- exists (the main schema.sql only adds it for brand-new tables).

alter table workers
  add column if not exists salary_pay_day int;
