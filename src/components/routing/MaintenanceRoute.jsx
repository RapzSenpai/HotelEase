import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenance } from "@/contexts/MaintenanceContext";

/**
 * Route gate for maintenance mode.
 *
 * Reads the shared MaintenanceContext (a single Firestore subscription for the
 * whole app) so navigating between wrapped routes no longer triggers a read or
 * a loader flash. Admins always bypass; everyone else is sent to /maintenance.
 */
export default function MaintenanceRoute({ children }) {
  const { role } = useAuth();
  const { enabled, loading } = useMaintenance();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (enabled && role !== "admin" && !location.pathname.startsWith("/maintenance")) {
    return <Navigate to="/maintenance" replace />;
  }

  return children ?? null;
}
