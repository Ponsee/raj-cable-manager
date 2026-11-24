-- A free-text note on each worker (safe to run more than once).
alter table workers add column if not exists notes text;
