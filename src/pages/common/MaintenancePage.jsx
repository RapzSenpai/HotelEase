import { useEffect, useState } from "react";
import { getMaintenanceStatus } from "@/services/maintenanceService";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function MaintenancePage() {
  const [maintenance, setMaintenance] = useState(null);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadStatus() {
      try {
        const status = await getMaintenanceStatus();
        setMaintenance(status);

        // If maintenance is disabled, leave the maintenance page:
        // admins go to the dashboard, everyone else goes to home.
        if (!status.enabled) {
          navigate(role === "admin" ? "/admin" : "/");
        }
      } catch (error) {
        console.error("Failed to load maintenance status:", error);
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, [role, navigate]);

  const handleRefresh = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-foreground/50" />
          <p className="text-foreground/70">Loading...</p>
        </div>
      </div>
    );
  }

  // If admin and maintenance is disabled, show option to go to dashboard
  if (role === "admin" && !maintenance?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-4">
          <AlertTriangle className="h-16 w-16 mx-auto text-foreground/50" />
          <h1 className="text-2xl font-semibold">Maintenance Mode Disabled</h1>
          <p className="text-foreground/70">
            The system is no longer in maintenance mode. You can access the admin dashboard.
          </p>
          <Button onClick={() => navigate("/admin")} className="gap-2">
            <Home className="h-4 w-4" />
            Go to Admin Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const message = maintenance?.message || "System is currently under maintenance. Please try again later.";
  const endTime = maintenance?.endTime ? new Date(maintenance.endTime) : null;
  const isScheduled = endTime && endTime > new Date();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="mx-auto max-w-2xl w-full space-y-6 rounded-2xl border border-border bg-background p-8 shadow-sm text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="inline-flex bg-destructive/10 rounded-full p-6 border border-destructive/20">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        {/* Content */}
        <h1 className="text-3xl font-playfair font-bold text-foreground">
          System Under Maintenance
        </h1>

        <p className="text-lg text-foreground/80 leading-relaxed">{message}</p>

        {isScheduled && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border text-sm">
            <RefreshCw className="h-4 w-4 text-foreground/50" />
            <span className="text-foreground/70">
              Expected back by {endTime.toLocaleString()}
            </span>
          </div>
        )}

        <div className="pt-2">
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh Page
          </Button>
        </div>

        <p className="text-sm text-foreground/40">
          We apologize for the inconvenience. Please check back soon.
        </p>
      </div>
    </div>
  );
}
