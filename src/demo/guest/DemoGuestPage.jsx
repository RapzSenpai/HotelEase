import { Navigate } from "react-router-dom";
import { useDemo } from "../DemoContext";

// Placeholder shell — full journeys land in Task 5.
export default function DemoGuestPage() {
  const { role } = useDemo();
  if (!role) return <Navigate to="/demo" replace />;
  return (
    <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/60">
      Guest demo journeys arrive next — browse, book, review, housekeeping.
    </div>
  );
}
