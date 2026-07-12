import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getLogoHomePath } from "@/lib/routing";

/** Blocks login/register for users who are already signed in. */
export default function GuestAuthRoute({ children }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={getLogoHomePath(role)} replace />;
  }

  return children ?? null;
}
