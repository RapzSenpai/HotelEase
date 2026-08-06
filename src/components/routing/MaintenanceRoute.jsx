import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getMaintenanceStatus } from "@/services/maintenanceService";

export default function MaintenanceRoute({ children }) {
  const { user, role, loading } = useAuth();
  const [maintenanceCheck, setMaintenanceCheck] = useState({
    enabled: false,
    loading: true,
  });

  useEffect(() => {
    async function checkMaintenance() {
      try {
        const status = await getMaintenanceStatus();
        setMaintenanceCheck({
          enabled: status.enabled,
          loading: false,
        });
      } catch (error) {
        console.error("Failed to check maintenance status:", error);
        // On error, allow access (fail open)
        setMaintenanceCheck({
          enabled: false,
          loading: false,
        });
      }
    }

    checkMaintenance();
  }, []);

  // Still checking maintenance status
  if (maintenanceCheck.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  // If maintenance is enabled and user is not admin, redirect to maintenance page
  if (maintenanceCheck.enabled && role !== "admin") {
    return <Navigate to="/maintenance" replace />;
  }

  // Allow access
  return children ?? null;
}
