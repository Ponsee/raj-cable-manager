import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { USER_STATUS_LABELS } from "../../constants";
import Breadcrumbs from "./Breadcrumbs";

// Top bar: hamburger (mobile), current user name + avatar (opens a profile
// dropdown), logout.
export default function Topbar({ onMenuClick }) {
  const { user, role, profile, status, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const name = profile?.name || user?.email?.split("@")[0] || "User";
  const initial = (profile?.name || user?.email || "?")[0]?.toUpperCase();

  // Close the dropdown when clicking outside of it.
  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
      <button
        className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="ml-2 min-w-0 flex-1 md:ml-0">
        <Breadcrumbs />
      </div>

      <div className="relative ml-4 shrink-0" ref={menuRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 rounded-lg p-1 pr-2 transition hover:bg-gray-50"
        >
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-gray-800">{name}</p>
            <p className="text-xs capitalize text-gray-500">{role || "—"}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
            {initial}
          </div>
          <svg
            className={`hidden h-4 w-4 text-gray-400 transition sm:block ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Profile dropdown */}
        {open && (
          <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{name}</p>
                <p className="truncate text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>

            <dl className="space-y-2 px-4 py-3 text-sm">
              <ProfileRow label="Mobile" value={profile?.phone || "—"} />
              <ProfileRow
                label="Role"
                value={role ? <span className="capitalize">{role}</span> : "—"}
              />
              <ProfileRow
                label="Status"
                value={
                  status ? USER_STATUS_LABELS[status] || status : "—"
                }
              />
            </dl>

            <div className="border-t border-gray-100 p-2">
              <button
                onClick={signOut}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
