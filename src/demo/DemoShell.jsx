import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useMobileNav } from "@/components/layout/mobile-nav-context";
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
  const { open, onClose } = useMobileNav();
  // Path wins: deep links and role switches land here with a stale persisted
  // role, so infer from the path first and fall back to the stored pick.
  const activeRole = ROLE_PATHS.find((r) => location.pathname.startsWith(r.path))?.id ?? role ?? null;
  const staffRole = activeRole === "fo" || activeRole === "admin" ? activeRole : null;

  // Leaving the demo unmounts this shell — drop the drawer with it so a later
  // visit never starts with a stale open drawer.
  useEffect(() => () => onClose?.(), [onClose]);

  if (!staffRole) return <Outlet />;

  return (
    <div className="md:flex md:gap-5">
      <DemoSidebar role={staffRole} open={open} onClose={onClose} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
