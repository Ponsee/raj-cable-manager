import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants";

// Wraps pages that require login. Pass requireAdmin to also require the
// admin role (used for the Users management screen).
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, role, loading } = useAuth();

  const spinner = (
    <div className="flex h-screen items-center justify-center text-gray-500">
      Loading...
    </div>
  );

  if (loading) return spinner;

  // Not logged in -> send back to the login page.
  if (!user) return <Navigate to="/" replace />;

  // Admin-only pages: wait for the profile to load, then check the role.
  if (requireAdmin) {
    if (!profile) return spinner;
    if (role !== ROLES.ADMIN) return <Navigate to="/dashboard" replace />;
  }

  return children;
}
