import { useState } from "react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { markRecharged } from "../../services/connectionsService";
import { todayISO, defaultExpiry } from "../../utils/ftu";
import RechargeDates from "./RechargeDates";

// "Recharged" button: records the last recharge date by hand (no income entry).
export default function RechargedModal({ open, onClose, connection, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title="Customer recharged">
      {open && connection && (
        <Body connection={connection} onSaved={onSaved} onClose={onClose} />
      )}
    </Modal>
  );
}

function Body({ connection, onSaved, onClose }) {
  const [dates, setDates] = useState({ on: todayISO(), expires: defaultExpiry(todayISO()) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    const date = dates.on;
    if (!date) return setError("Pick the recharge date.");
    setSaving(true);
    setError("");
    try {
      await markRecharged(connection.id, date, dates.expires);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <p className="text-sm text-gray-600">
        Last recharge date for the <b>{connection.provider?.name}</b> connection
        {connection.username ? ` (${connection.username})` : ""}. This does not create an
        income entry.
      </p>
      <RechargeDates requireOn on={dates.on} expires={dates.expires} onChange={setDates} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
