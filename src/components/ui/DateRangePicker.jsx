// Two date inputs ("start" to "end"). Empty value = no bound on that side.
// onChange receives the full { start, end } object.
export default function DateRangePicker({ start, end, onChange }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input
        type="date"
        value={start}
        onChange={(e) => onChange({ start: e.target.value, end })}
        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm sm:flex-none"
      />
      <span className="text-gray-500">to</span>
      <input
        type="date"
        value={end}
        onChange={(e) => onChange({ start, end: e.target.value })}
        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm sm:flex-none"
      />
      {(start || end) && (
        <button
          type="button"
          onClick={() => onChange({ start: "", end: "" })}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// Helper: is an ISO timestamp within [start, end]? Empty bounds always pass.
export function inRange(ts, start, end) {
  const d = new Date(ts).toISOString().split("T")[0];
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}
