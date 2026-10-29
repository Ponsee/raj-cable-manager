// Small key/value settings stored in app_settings (FTU reminder thresholds).
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { FTU_DEFAULT_DUE_DAYS, FTU_DEFAULT_COLLECT_DAYS } from "../constants";

const DUE = "ftu_due_days";
const COLLECT = "ftu_collect_days";

// { dueDays, collectDays } — falls back to the defaults (30 / 60) if the table is
// empty or not there yet, so the reminders still work.
export async function getFtuSettings() {
  const defaults = { dueDays: FTU_DEFAULT_DUE_DAYS, collectDays: FTU_DEFAULT_COLLECT_DAYS };
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [DUE, COLLECT]);
  if (error) return defaults;
  const map = Object.fromEntries((data || []).map((r) => [r.key, Number(r.value)]));
  return {
    dueDays: map[DUE] > 0 ? map[DUE] : defaults.dueDays,
    collectDays: map[COLLECT] > 0 ? map[COLLECT] : defaults.collectDays,
  };
}

// Admin only (enforced by RLS). Due-soon must come before collect.
export async function saveFtuSettings({ dueDays, collectDays }) {
  const due = Math.floor(Number(dueDays));
  const collect = Math.floor(Number(collectDays));
  if (!(due >= 1) || !(collect >= 1)) throw new Error("Days must be at least 1.");
  if (due >= collect) throw new Error("\"Due soon\" days must be less than \"Collect\" days.");
  const { error } = await supabase.from("app_settings").upsert([
    { key: DUE, value: due },
    { key: COLLECT, value: collect },
  ]);
  throwDb(error);
}
