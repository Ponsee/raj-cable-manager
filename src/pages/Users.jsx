import { useEffect, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import {
  getProfiles,
  approveUser,
  setUserRole,
  setUserStatus,
} from "../services/usersService";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  USER_STATUS,
  USER_STATUS_LABELS,
} from "../constants";
import { formatDate } from "../utils/format";

const statusBadge = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  disabled: "bg-gray-200 text-gray-600",
};

export default function Users() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState(null);
  const [confirm, setConfirm] = useState(null); // { user, nextStatus }
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setProfiles(await getProfiles());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changeRole = async (id, role) => {
    setBusyId(id);
    try {
      await setUserRole(id, role);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const doStatusChange = async () => {
    if (!confirm) return;
    setBusyId(confirm.user.id);
    try {
      await setUserStatus(confirm.user.id, confirm.nextStatus);
      setConfirm(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-gray-400">Loading users...</p>;

  const pending = profiles.filter((p) => p.status === USER_STATUS.PENDING);
  const others = profiles.filter((p) => p.status !== USER_STATUS.PENDING);

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Approve sign-ups, set roles, and disable accounts"
      />

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
          <div className="border-b border-amber-200 px-4 py-3">
            <h3 className="font-semibold text-amber-800">
              Approval requests ({pending.length})
            </h3>
            <p className="text-xs text-amber-700">
              These people signed up and are waiting to be let in.
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{p.name || "—"}</p>
                  <p className="truncate text-sm text-gray-500">{p.email}</p>
                  <p className="text-sm text-gray-500">{p.phone || "No phone"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button onClick={() => setApproveTarget(p)}>
                    Approve & set role
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === p.id}
                    onClick={() =>
                      setConfirm({ user: p, nextStatus: USER_STATUS.DISABLED })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All users */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-800">All users</h3>
        </div>
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {others.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No users yet.
                  </td>
                </tr>
              ) : (
                others.map((p) => {
                  const isSelf = p.id === user?.id;
                  const isApproved = p.status === USER_STATUS.APPROVED;
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {p.name || "—"}
                          {isSelf && (
                            <span className="ml-1 text-xs text-gray-400">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          Joined {formatDate(p.created_at)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <p className="truncate">{p.email}</p>
                        <p className="text-xs text-gray-400">{p.phone || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        {isApproved ? (
                          <select
                            value={p.role || ""}
                            disabled={isSelf || busyId === p.id}
                            onChange={(e) => changeRole(p.id, e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[p.status]}`}
                        >
                          {USER_STATUS_LABELS[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSelf ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : isApproved ? (
                          <button
                            disabled={busyId === p.id}
                            onClick={() =>
                              setConfirm({
                                user: p,
                                nextStatus: USER_STATUS.DISABLED,
                              })
                            }
                            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            disabled={busyId === p.id}
                            onClick={() => setApproveTarget(p)}
                            className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50"
                          >
                            Enable
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ApproveModal
        target={approveTarget}
        onClose={() => setApproveTarget(null)}
        onApproved={async () => {
          setApproveTarget(null);
          await load();
        }}
        approvedBy={user?.id}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doStatusChange}
        title={
          confirm?.nextStatus === USER_STATUS.DISABLED
            ? "Disable this account?"
            : "Enable this account?"
        }
        message={
          confirm?.nextStatus === USER_STATUS.DISABLED
            ? `${confirm?.user?.name || confirm?.user?.email} will no longer be able to log in. You can re-enable them later.`
            : `${confirm?.user?.name || confirm?.user?.email} will be able to log in again.`
        }
        confirmLabel={
          confirm?.nextStatus === USER_STATUS.DISABLED ? "Disable" : "Enable"
        }
        loading={busyId === confirm?.user?.id}
      />
    </div>
  );
}

// Pick a role, then approve / enable the user with it.
function ApproveModal({ target, onClose, onApproved, approvedBy }) {
  const [role, setRole] = useState(ASSIGNABLE_ROLES[1]); // default Staff
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) {
      setRole(target.role || ASSIGNABLE_ROLES[1]);
      setError("");
    }
  }, [target]);

  const handleApprove = async () => {
    setSaving(true);
    setError("");
    try {
      await approveUser(target.id, role, approvedBy);
      await onApproved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  return (
    <Modal open={!!target} onClose={onClose} title="Approve user">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <p className="font-medium text-gray-900">{target.name || "—"}</p>
          <p className="text-gray-500">{target.email}</p>
          <p className="text-gray-500">{target.phone || "No phone"}</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Choose a role
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ASSIGNABLE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${
                  role === r
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={saving} onClick={handleApprove}>
            {saving ? "Approving..." : "Approve"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
