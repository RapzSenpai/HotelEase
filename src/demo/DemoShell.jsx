import { Outlet, useLocation } from "react-router-dom";
import { useDemo } from "./DemoContext";
import DemoSidebar from "./DemoSidebar";

const ROLE_PATHS = [
  { id: "guest", path: "/demo/guest" },
  { id: "fo", path: "/demo/fo" },
  { id: "admin", path: "/demo/admin" },
];

// Chrome only: staff get the real sidebar (which carries Exit demo), guests get
// their own bar from DemoGuestLayout. No role switcher here — leaving the demo
// and picking another role from the landing page is the way back.
export default function DemoShell() {
  const location = useLocation();
  const { role } = useDemo();
  // Path wins: deep links and role switches land here with a stale persisted
  // role, so infer from the path first and fall back to the stored pick.
  const activeRole = ROLE_PATHS.find((r) => location.pathname.startsWith(r.path))?.id ?? role ?? null;
  const staffRole = activeRole === "fo" || activeRole === "admin" ? activeRole : null;

  if (!staffRole) return <Outlet />;

  return (
    <div className="md:flex md:gap-5">
      <DemoSidebar role={staffRole} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
