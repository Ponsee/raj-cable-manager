import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS, ROLES } from "../../constants";
import { useAuth } from "../../context/AuthContext";
import { getPendingCount } from "../../services/usersService";

// Left navigation. On mobile it slides in/out (controlled by `open`).
export default function Sidebar({ open, onClose }) {
  const { role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;
  const [pendingCount, setPendingCount] = useState(0);

  // Admins see how many sign-ups are waiting for approval.
  useEffect(() => {
    if (isAdmin) getPendingCount().then(setPendingCount);
  }, [isAdmin]);

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  // Group the visible items by their section, preserving order.
  const groups = [];
  for (const item of navItems) {
    let g = groups.find((x) => x.name === item.group);
    if (!g) {
      g = { name: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <>
      {/* Dark overlay behind the sidebar on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed z-30 flex h-full w-64 flex-col bg-slate-900 text-slate-100 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-5 py-4">
          <img
            src="/LOGO.png"
            alt="Raj Cable TV & Broadband"
            className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-lg shadow-indigo-500/30"
          />
          <div className="leading-tight">
            <h1 className="whitespace-nowrap text-sm font-bold">
              Raj Cable TV &amp; Broadband
            </h1>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {groups.map((g) => (
            <div key={g.name} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {g.name}
              </p>
              {g.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.path === "/users" && pendingCount > 0 && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-700/60 p-4 text-center text-xs text-slate-500">
          v0.1 · Business Manager
        </div>
      </aside>
    </>
  );
}
