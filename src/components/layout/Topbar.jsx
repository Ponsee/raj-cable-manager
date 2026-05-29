import { useAuth } from "../../context/AuthContext";

// Top bar: hamburger (mobile), current user avatar, logout.
export default function Topbar({ onMenuClick }) {
  const { user, role, signOut } = useAuth();

  // First letter of the email for the avatar circle.
  const initial = user?.email?.[0]?.toUpperCase() || "?";

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

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-gray-800">{user?.email}</p>
          <p className="text-xs capitalize text-gray-500">{role || "—"}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
          {initial}
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
