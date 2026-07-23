import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { User, Menu } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import { getLogoHomePath, isStaffRole } from "@/lib/routing";
import { cn } from "@/lib/utils";

export default function Navbar({ onToggleSidebar }) {
  const { user, role, logout, loading } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const roleResolved = !user || !loading;
  const isFoOrAdmin = roleResolved && isStaffRole(role);
  const homePath = getLogoHomePath(role);

  const logo = (
    <>
      <span className="font-playfair text-xl font-semibold text-foreground">
        HotelEase
      </span>
      <span className="hidden rounded-md bg-primary/20 px-2 py-0.5 text-xs font-medium text-foreground sm:inline">
        BSHM-PMS
      </span>
    </>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b backdrop-blur-xl transition-colors duration-300",
        isLanding
          ? "border-border/10 bg-background/15 supports-[backdrop-filter]:bg-background/10"
          : "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
        {/* Logo — staff/guest home only after role is resolved */}
        {roleResolved ? (
          <NavLink to={homePath} className="flex shrink-0 items-center gap-2.5">
            {logo}
          </NavLink>
        ) : (
          <span
            className="flex shrink-0 items-center gap-2.5"
            aria-busy="true"
            aria-label="Loading navigation"
          >
            {logo}
          </span>
        )}

        {/* Centre nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {roleResolved && !isFoOrAdmin && (
            <NavLink
              to="/rooms"
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground/70 hover:bg-surface-hover hover:text-foreground/90"
                }`
              }
            >
              Rooms
            </NavLink>
          )}

          {roleResolved && user && role === "guest" && (
            <>
              <NavLink
                to="/my-bookings"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground/70 hover:bg-surface-hover hover:text-foreground/90"
                  }`
                }
              >
                My Bookings
              </NavLink>
              <NavLink
                to="/favorites"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground/70 hover:bg-surface-hover hover:text-foreground/90"
                  }`
                }
              >
                Favorites
              </NavLink>
            </>
          )}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {/* Mobile sidebar toggle — FO/Admin only */}
              {isFoOrAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={onToggleSidebar}
                  aria-label="Toggle sidebar"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              {/* Role badge — FO/Admin only */}
              {isFoOrAdmin && (
                <span className="hidden rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs font-medium text-foreground/60 sm:inline">
                  {role === "fo" ? "Front Office" : "Admin"}
                </span>
              )}

              {/* Notification Bell */}
              <NotificationBell />

              {/* Profile link — guests only */}
              {role === "guest" && (
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    `hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors sm:flex ${
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground/70 hover:bg-surface-hover hover:text-foreground/90"
                    }`
                  }
                >
                  <User className="h-4 w-4" />
                  Profile
                </NavLink>
              )}

              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => logout().catch(() => {})}
              >
                {loading ? "…" : "Logout"}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <NavLink to="/login">Login</NavLink>
              </Button>
              <Button asChild variant="default" size="sm">
                <NavLink to="/register">Register</NavLink>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
