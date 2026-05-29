-- Per-contractor pricing for contract workers.
-- Stores the rate rules for that worker's main work type, for example:
--   splicing     -> { "low_joint_limit": 4, "low_rate": 100, "high_rate": 90 }
--   wire_laying  -> { "rate_per_km": 3500 }
-- Run this once in the Supabase SQL Editor. Safe to run again (IF NOT EXISTS).

alter table workers add column if not exists pricing jsonb;
