import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { User, Menu, X, BedDouble, CalendarDays, Heart, LogOut } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import { getLogoHomePath, isStaffRole } from "@/lib/routing";
import { cn } from "@/lib/utils";

export default function Navbar({ onToggleSidebar }) {
  const { user, role, logout, loading } = useAuth();
  const location = useLocation();
  const [mobileGuestMenuOpen, setMobileGuestMenuOpen] = useState(false);

  const isLanding = location.pathname === "/";
  const roleResolved = !user || !loading;
  const isFoOrAdmin = roleResolved && isStaffRole(role);
  const isGuest = roleResolved && user && role === "guest";
  const homePath = getLogoHomePath(role);

  // Auto-close mobile guest drawer when route changes
  useEffect(() => {
    setMobileGuestMenuOpen(false);
  }, [location.pathname]);

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
        {/* Logo */}
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

        {/* Desktop Centre nav */}
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

          {isGuest && (
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
                to="/housekeeping"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground/70 hover:bg-surface-hover hover:text-foreground/90"
                  }`
                }
              >
                Housekeeping
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

              {/* Mobile guest hamburger menu toggle — Guest only */}
              {isGuest && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden"
                  onClick={() => setMobileGuestMenuOpen((prev) => !prev)}
                  aria-label="Toggle guest navigation menu"
                >
                  {mobileGuestMenuOpen ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </Button>
              )}

              {/* Notification Bell */}
              <NotificationBell />

              {/* Profile link — desktop guests only */}
              {isGuest && (
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
                className="hidden sm:inline-flex"
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

      {/* Mobile Guest Drawer / Dropdown Menu */}
      {isGuest && mobileGuestMenuOpen && (
        <div className="border-b border-border/80 bg-background/95 px-5 py-4 shadow-lg backdrop-blur-xl sm:hidden animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-2">
            <NavLink
              to="/rooms"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/80 hover:bg-muted"
                }`
              }
            >
              <BedDouble className="h-4 w-4" />
              Rooms
            </NavLink>

            <NavLink
              to="/my-bookings"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/80 hover:bg-muted"
                }`
              }
            >
              <CalendarDays className="h-4 w-4" />
              My Bookings
            </NavLink>

            <NavLink
              to="/housekeeping"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/80 hover:bg-muted"
                }`
              }
            >
              Housekeeping
            </NavLink>

            <NavLink
              to="/favorites"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/80 hover:bg-muted"
                }`
              }
            >
              <Heart className="h-4 w-4" />
              Favorites
            </NavLink>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/80 hover:bg-muted"
                }`
              }
            >
              <User className="h-4 w-4" />
              Profile
            </NavLink>

            <div className="my-1 h-px bg-border/60" />

            <Button
              variant="outline"
              size="sm"
              className="flex w-full items-center justify-center gap-2"
              disabled={loading}
              onClick={() => {
                setMobileGuestMenuOpen(false);
                logout().catch(() => {});
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
