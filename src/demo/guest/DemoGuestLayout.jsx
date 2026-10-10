import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LINKS = [
  { to: "/demo/guest", label: "Rooms", end: true },
  { to: "/demo/guest/bookings", label: "My bookings" },
  { to: "/demo/guest/stay", label: "Your stay" },
];

// The guest demo has no sidebar (matching the real app), so this slim bar is its
// only chrome: section links plus the exit. Same classes as the staff sidebar
// links so the two read as one product.
export default function DemoGuestLayout() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-background/90 p-2.5 shadow-sm backdrop-blur md:px-3">
        <Badge variant="primary" className="shrink-0">Try Demo</Badge>
        <span className="hidden text-xs text-foreground/60 sm:inline">
          Simulated booking — nothing is saved.
        </span>
        <nav className="-mx-1 order-last flex w-full items-center gap-1 overflow-x-auto px-1 sm:order-none sm:ml-auto sm:w-auto">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end ?? false}
              className={({ isActive }) =>
                [
                  "shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                  isActive
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/85",
                ].join(" ")
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 text-xs hover:bg-destructive/10 hover:text-destructive sm:ml-0"
          onClick={() => navigate("/")}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Exit demo
        </Button>
      </div>
      <Outlet />
    </div>
  );
}
