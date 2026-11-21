import { useState } from "react";
import { defaultExpiry, todayISO } from "../../utils/ftu";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Recharge date + expiry date. The expiry follows the recharge date (+30 days)
// until someone picks it by hand; after that it is left alone.
export default function RechargeDates({ on, expires, onChange, requireOn = false }) {
  const [manual, setManual] = useState(!!expires); // an existing expiry counts as chosen
  const setOn = (v) => onChange({ on: v, expires: manual ? expires : defaultExpiry(v) });
  const setExpires = (v) => {
    setManual(true);
    onChange({ on, expires: v });
  };
  const reset = () => {
    setManual(false);
    onChange({ on, expires: defaultExpiry(on) });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {requireOn ? "Recharged on" : "Last recharge date"}
        </label>
        <input type="date" value={on || ""} max={todayISO()} onChange={(e) => setOn(e.target.value)} className={inputClass} />
        {!requireOn && <p className="mt-1 text-xs text-gray-400">Leave blank if not known yet.</p>}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Recharge expires on</label>
        <input type="date" value={expires || ""} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
        <p className="mt-1 text-xs text-gray-400">
          Auto-filled for a 30-day plan (recharged 21 Nov → expires 20 Dec). Pick another date if the plan is different.
          {manual && on && expires !== defaultExpiry(on) && (
            <button type="button" onClick={reset} className="ml-1 text-indigo-600 hover:underline">
              Reset to 30 days
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
