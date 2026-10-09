import { Navigate } from "react-router-dom";
import { useDemo } from "../DemoContext";

// Placeholder shell — full journeys land in Task 7.
export default function DemoAdminPage() {
  const { role } = useDemo();
  if (!role) return <Navigate to="/demo" replace />;
  return (
    <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/60">
      Admin demo journeys arrive next — rooms, users, analytics.
    </div>
  );
}
