/** Navbar logo / public site home — guests and visitors always return to the landing page. */
export function getLogoHomePath(role) {
  if (role === "fo") return "/fo";
  if (role === "admin") return "/admin";
  return "/";
}

/**
 * Where LoginPage sends the user after a successful login.
 * `from` (react-router location.state.from, e.g. PrivateRoute or the
 * concierge's sign-in handoff) wins only when it is a safe internal path —
 * "//host" and "/\host" are rejected because the browser resolves them
 * cross-origin. Otherwise the historical per-role default applies; note the
 * fallback is /my-bookings (not getHomePathForRole) because role state can
 * still be stale right after login.
 */
export function resolveLoginRedirect(from, role) {
  const isSafePath =
    typeof from === "string" &&
    from.startsWith("/") &&
    !from.startsWith("//") &&
    !from.startsWith("/\\");
  if (isSafePath) return from;
  if (role === "fo") return "/fo";
  if (role === "admin") return "/admin";
  return "/my-bookings";
}

/** Default post-login / post-auth redirect for each role. */
export function getHomePathForRole(role) {
  if (role === "fo") return "/fo";
  if (role === "admin") return "/admin";
  if (role === "guest") return "/my-bookings";
  return "/";
}

export function isStaffRole(role) {
  return role === "fo" || role === "admin";
}
