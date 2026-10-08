import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getLogoHomePath } from "@/lib/routing";

/** Blocks login/register for users who are already signed in. */
export default function GuestAuthRoute({ children }) {
  const { user, role, loading, profile } = useAuth();

  // While a sign-in attempt is in flight (AuthContext toggles `loading`),
  // keep the form mounted so failed attempts don't wipe the user's input.
  // The full-screen loader is reserved for the post-auth window where a user
  // exists but their profile/role is still resolving.
  if (user && loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (user) {
    // A signed-in guest who still has to verify belongs on the OTP screen, not
    // on the landing page: register() keeps the new session, so this guard can
    // fire before the register page's own redirect to /verify-email.
    const needsVerification =
      role === "guest" && !user.isAnonymous && profile?.emailVerified === false;
    return (
      <Navigate
        to={needsVerification ? "/verify-email" : getLogoHomePath(role)}
        replace
      />
    );
  }

  return children ?? null;
}
