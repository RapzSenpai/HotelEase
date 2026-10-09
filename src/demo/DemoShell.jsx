import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "./DemoContext";

const ROLE_TABS = [
  { id: "guest", label: "Guest", to: "/demo/guest" },
  { id: "fo", label: "Front Office", to: "/demo/fo" },
  { id: "admin", label: "Admin", to: "/demo/admin" },
];

export default function DemoShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, setRole, resetDemo } = useDemo();
  // Deep links land here without a prior pick — infer role from the path.
  const activeRole = role ?? ROLE_TABS.find((t) => location.pathname.startsWith(t.to))?.id ?? null;

  function switchRole(tab) {
    setRole(tab.id);
    resetDemo();
    navigate(tab.to);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary" className="shrink-0">Try Demo</Badge>
          <p className="text-xs text-foreground/70">
            Simulated data — exploring here never touches the real system.
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {ROLE_TABS.map((tab) => (
              <Button
                key={tab.id}
                variant={activeRole === tab.id ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => switchRole(tab)}
              >
                {tab.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => navigate("/")}
            >
              Exit demo
            </Button>
          </div>
        </div>
      </div>
      <Outlet />
      <p className="text-center text-xs text-foreground/40">
        Demo only — <NavLink to="/" className="text-primary hover:underline underline-offset-4">back to HotelEase</NavLink>
      </p>
    </div>
  );
}
