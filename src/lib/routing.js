/** Navbar logo / public site home — guests and visitors always return to the landing page. */
export function getLogoHomePath(role) {
  if (role === "fo") return "/fo";
  if (role === "admin") return "/admin";
  return "/";
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
