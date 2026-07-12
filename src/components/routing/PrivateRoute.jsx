import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getHomePathForRole } from "@/lib/routing";

export default function PrivateRoute({ allowedRoles = [], children }) {
  const location = useLocation();
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return (
      <Navigate
        to={getHomePathForRole(role)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children ?? null;
}

