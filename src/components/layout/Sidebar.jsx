import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFOIndicators } from "@/hooks/useFOIndicators";
import { subscribeToUnresolvedCount } from "@/services/alertService";
import { X } from "lucide-react";
import {
  LayoutDashboard,
  LogIn,
  LogOut,
  Sparkles,
  CreditCard,
  Megaphone,
  DollarSign,
  CalendarDays,
  BarChart3,
  Users,
  Building2,
  Settings,
  RotateCcw,
  Mail,
  MessageSquareQuote,
  XCircle,
  ClipboardList,
  Activity,
  Shield,
  Bell,
  Gauge,
} from "lucide-react";

const FO_LINKS = [
  {
    group: "Daily Operations",
    items: [
      { to: "/fo", label: "Dashboard", icon: LayoutDashboard, end: true },
      {
        to: "/fo/check-in",
        label: "Check-In",
        icon: LogIn,
        notification: { type: "dot", key: "hasApprovedCheckIns" },
      },
      {
        to: "/fo/check-out",
        label: "Check-Out",
        icon: LogOut,
        notification: { type: "dot", key: "hasDueCheckOuts" },
      },
      {
        to: "/fo/housekeeping",
        label: "Housekeeping",
        icon: Sparkles,
        notification: { type: "dot", key: "hasDirtyRooms" },
      },
      {
        to: "/fo/cancellations",
        label: "Cancellations",
        icon: XCircle,
        notification: { type: "dot", key: "hasPendingCancellations" },
      },
    ],
  },
  {
    group: "Revenue Management",
    items: [
      { to: "/fo/payments", label: "Payments", icon: CreditCard },
      {
        to: "/fo/bookings",
        label: "Bookings",
        icon: CalendarDays,
        notification: { type: "count", key: "pendingBookingsCount" },
      },
    ],
  },
  {
    group: "Communication",
    items: [
      { to: "/fo/announcements", label: "Announcements", icon: Megaphone },
    ],
  },
];

const ADMIN_LINKS = [
  {
    group: "Analytics & Operations",
    items: [
      { to: "/admin", label: "Analytics", icon: BarChart3, end: true },
      { to: "/admin/operations", label: "Operations", icon: ClipboardList },
    ],
  },
  {
    group: "Management",
    items: [
      { to: "/admin/users", label: "User Management", icon: Users },
      {
        to: "/admin/rooms",
        label: "Room Management",
        icon: Building2,
        notification: { type: "dot", key: "hasDirtyRooms" },
      },
      { to: "/admin/room-rates", label: "Room Rates", icon: DollarSign },
    ],
  },
  {
    group: "Communication",
    items: [
      {
        to: "/admin/messages",
        label: "Messages",
        icon: Mail,
        notification: { type: "count", key: "unreadMessagesCount" },
      },
      {
        to: "/admin/testimonials",
        label: "Testimonials",
        icon: MessageSquareQuote,
        notification: { type: "count", key: "pendingTestimonialsCount" },
      },
    ],
  },
  {
    group: "System",
    items: [
      {
        to: "/admin/alerts",
        label: "Alerts",
        icon: Bell,
        notification: { type: "count", key: "unresolvedAlertsCount" },
      },
      { to: "/admin/health", label: "System Health", icon: Activity },
      { to: "/admin/performance", label: "Performance", icon: Gauge },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: Shield },
      { to: "/admin/settings", label: "System Settings", icon: Settings },
      { to: "/admin/training-reset", label: "Training Reset", icon: RotateCcw },
    ],
  },
];

function SidebarNotification({ type, value }) {
  if (!value) return null;

  if (type === "count") {
    const count = Number(value);
    if (count <= 0) return null;

    const displayCount = count > 99 ? "99+" : count;

    return (
      <span
        className={[
          "flex items-center justify-center text-[10px] font-semibold",
          "bg-primary text-primary-foreground border border-primary/10",
          "animate-in fade-in-0 duration-200 shadow-sm transition-all",
          count < 10
            ? "h-5 w-5 rounded-full"
            : "h-5 min-w-[20px] px-1.5 rounded-full",
        ].join(" ")}
      >
        {displayCount}
      </span>
    );
  }

  if (type === "dot") {
    return (
      <span className="relative flex h-2 w-2 mr-1">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      </span>
    );
  }

  if (type === "new") {
    return (
      <span className="flex items-center justify-center text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase animate-in fade-in-0 duration-200">
        NEW
      </span>
    );
  }

  return null;
}

export default function Sidebar({ open, onClose }) {
  const { role, user, trainingMode, logout } = useAuth();
  const location = useLocation();
  const [visitedSections, setVisitedSections] = useState(new Set());
  const [unresolvedAlertsCount, setUnresolvedAlertsCount] = useState(0);

  const {
    pendingBookingsCount,
    unreadMessagesCount,
    hasApprovedCheckIns,
    hasDueCheckOuts,
    hasDirtyRooms,
    dirtyRoomsCount,
    pendingTestimonialsCount,
    hasPendingCancellations,
  } = useFOIndicators({ trainingMode, role });

  useEffect(() => {
    if (role !== "admin") return;
    const unsub = subscribeToUnresolvedCount(setUnresolvedAlertsCount, { trainingMode });
    return () => unsub();
  }, [role, trainingMode]);

  const indicators = useMemo(
    () => ({
      pendingBookingsCount,
      unreadMessagesCount,
      hasApprovedCheckIns,
      hasDueCheckOuts,
      hasDirtyRooms,
      pendingTestimonialsCount,
      hasPendingCancellations,
      unresolvedAlertsCount,
    }),
    [
      pendingBookingsCount,
      unreadMessagesCount,
      hasApprovedCheckIns,
      hasDueCheckOuts,
      hasDirtyRooms,
      pendingTestimonialsCount,
      hasPendingCancellations,
      unresolvedAlertsCount,
    ],
  );

  // Only show Messages and Testimonials indicators for Admin role
  const filteredIndicators = role === "admin" ? indicators : {
    ...indicators,
    unreadMessagesCount: 0,
    pendingTestimonialsCount: 0,
    unresolvedAlertsCount: 0,
  };

// Re-arm dot indicators when a NEW event arrives after the section was last
// seen. Uses the last seen value/count as a baseline: when the current value
// exceeds it (e.g. a second room became dirty after one was already dirty,
// or a fresh check-in/check-out/cancellation appeared), the visited mark is
// cleared so the dot pings again.
  const seenBaseline = useRef({});
  useEffect(() => {
    const activeGroups = role === "fo" ? FO_LINKS : ADMIN_LINKS;
    const baseline = seenBaseline.current;
    const rearmPaths = [];

    for (const group of activeGroups) {
      for (const link of group.items) {
        const notif = link.notification;
        if (!notif || notif.type !== "dot") continue;
        const key = notif.key;
        // Use the numeric value so e.g. "hasDirtyRooms" (boolean) can be
        // compared via the room count to detect a second room getting dirty.
        const current =
          key === "hasDirtyRooms" ? dirtyRoomsCount : indicators[key] ? 1 : 0;

        if (location.pathname === link.to) {
          // Keep the baseline current while on the section so the dot is not
          // re-armed for events already visible on the page.
          baseline[key] = current;
          continue;
        }

        const currentBaseline = baseline[key];
        if (current > 0 && currentBaseline !== undefined && current > currentBaseline) {
          rearmPaths.push(link.to);
          baseline[key] = current;
        }
      }
    }

    if (rearmPaths.length > 0) {
      const paths = rearmPaths;
      queueMicrotask(() => {
        setVisitedSections((prev) => {
          const next = new Set(prev);
          for (const p of paths) next.delete(p);
          return next;
        });
      });
    }
  }, [indicators, dirtyRoomsCount, role, location.pathname]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    onClose?.();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark section paths as visited (state adjusted during render so we don't
  // setState synchronously inside an effect).
  const [prevVisitedPath, setPrevVisitedPath] = useState(location.pathname);
  if (prevVisitedPath !== location.pathname) {
    setPrevVisitedPath(location.pathname);
    if (location.pathname.startsWith("/fo/")) {
      setVisitedSections((prev) => new Set([...prev, location.pathname]));
    }
  }

  if (!user || (role !== "fo" && role !== "admin")) return null;

  const groups = role === "fo" ? FO_LINKS : ADMIN_LINKS;
  const roleLabel = role === "fo" ? "Front Office" : "Administrator";

  const shouldShowIndicator = (linkPath, value) => {
    if (!value) return false;
    if (location.pathname === linkPath) return false;
    return !visitedSections.has(linkPath);
  };

  const sidebarContent = (
    <div className="sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="p-3">
        {/* Mobile close button */}
        <div className="mb-3 flex items-center justify-between md:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            {roleLabel}
          </p>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-foreground/60 hover:bg-surface-hover hover:text-foreground"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role badge — desktop only */}
        <div className="mb-4 hidden rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 md:block">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            {roleLabel}
          </p>
        </div>

          {/* Grouped nav */}
          {groups.map((group, gi) => (
            <div key={group.group} className={gi > 0 ? "mt-4" : ""}>
              {/* Separator label */}
              <div className="flex items-center gap-2 px-1 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/30">
                  {group.group}
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              {/* Links */}
              <div className="space-y-0.5">
                {group.items.map((l) => {
                  const Icon = l.icon;
                  const notificationVal = l.notification
                    ? filteredIndicators[l.notification.key]
                    : null;
                  const showNotification = l.notification
                    ? shouldShowIndicator(l.to, notificationVal)
                    : false;

                  return (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.end ?? false}
                      className={({ isActive }) =>
                        [
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                          isActive
                            ? "bg-primary/15 text-foreground font-medium"
                            : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/85",
                        ].join(" ")
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{l.label}</span>

                      {showNotification && (
                        <SidebarNotification
                          type={l.notification.type}
                          value={notificationVal}
                        />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Logout — mobile drawer only; desktop uses the Navbar logout */}
          <div className="mt-4 md:hidden">
            <div className="h-px bg-border/60 mb-1.5" />
            <button
              type="button"
              onClick={() => {
                onClose?.();
                logout().catch(() => {});
              }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 w-full text-[13px] text-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive hover:font-medium"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">Logout</span>
            </button>
          </div>
        </div>
      </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible on md+ */}
      <aside className="hidden w-52 shrink-0 border-r border-border bg-background md:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — slide-out drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-background shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
