import { useEffect, useState } from "react";
import Button from "../ui/Button";
import { getFtuSettings, saveFtuSettings } from "../../services/settingsService";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Admin: how many days without a recharge before an FTU modem is flagged.
export default function FtuSettingsCard() {
  const [due, setDue] = useState("");
  const [collect, setCollect] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getFtuSettings().then((s) => {
      if (!alive) return;
      setDue(String(s.dueDays));
      setCollect(String(s.collectDays));
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    setSaving(true);
    try {
      await saveFtuSettings({ dueDays: due, collectDays: collect });
      setMsg("Saved. The Modems, Customers and Dashboard pages use these days.");
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 font-semibold text-gray-800">FTU modem reminders</h3>
      <p className="mb-4 text-xs text-gray-500">
        Days since a connection's last recharge before its free-to-use modem is flagged.
      </p>
      <form onSubmit={save} className="space-y-3">
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">"Due soon" after (days)</label>
            <input type="number" min="1" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">"Collect modem" after (days)</label>
            <input type="number" min="1" value={collect} onChange={(e) => setCollect(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </div>
  );
}
