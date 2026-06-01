import Modal from "./Modal";
import Button from "./Button";

// Reusable confirmation popup (used for deletes and other risky actions).
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  loading = false,
  error = "",
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} loading={loading}>
          {loading ? "Working..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
