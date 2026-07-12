import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFOIndicators } from "@/hooks/useFOIndicators";
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
} from "lucide-react";

const FO_LINKS = [
  { to: "/fo", label: "Dashboard", icon: LayoutDashboard, end: true },
  { 
    to: "/fo/check-in", 
    label: "Check-In", 
    icon: LogIn, 
    notification: { type: "dot", key: "hasApprovedCheckIns" } 
  },
  { 
    to: "/fo/check-out", 
    label: "Check-Out", 
    icon: LogOut, 
    notification: { type: "dot", key: "hasDueCheckOuts" } 
  },
  { 
    to: "/fo/housekeeping", 
    label: "Housekeeping", 
    icon: Sparkles, 
    notification: { type: "dot", key: "hasDirtyRooms" } 
  },
  { to: "/fo/payments", label: "Payments", icon: CreditCard },
  { to: "/fo/announcements", label: "Announcements", icon: Megaphone },
  { to: "/fo/room-rates", label: "Room Rates", icon: DollarSign },
  { 
    to: "/fo/bookings", 
    label: "Bookings", 
    icon: CalendarDays, 
    notification: { type: "count", key: "pendingBookingsCount" } 
  },
  { 
    to: "/fo/messages", 
    label: "Messages", 
    icon: Mail, 
    notification: { type: "count", key: "unreadMessagesCount" } 
  },
  { 
    to: "/fo/cancellations", 
    label: "Cancellations", 
    icon: XCircle, 
    notification: { type: "dot", key: "hasPendingCancellations" }
  },
  { 
    to: "/fo/testimonials", 
    label: "Testimonials", 
    icon: MessageSquareQuote, 
    notification: { type: "count", key: "pendingTestimonialsCount" } 
  },
];

const ADMIN_LINKS = [
  { to: "/admin", label: "Analytics", icon: BarChart3, end: true },
  { to: "/admin/users", label: "User Management", icon: Users },
  { to: "/admin/rooms", label: "Room Management", icon: Building2 },
  { to: "/admin/settings", label: "System Settings", icon: Settings },
  { to: "/admin/training-reset", label: "Training Reset", icon: RotateCcw },
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
            : "h-5 min-w-[20px] px-1.5 rounded-full"
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

export default function Sidebar() {
  const { role, user, trainingMode } = useAuth();
  const location = useLocation();
  const [visitedSections, setVisitedSections] = useState(new Set());
  
  const {
    pendingBookingsCount,
    unreadMessagesCount,
    hasApprovedCheckIns,
    hasDueCheckOuts,
    hasDirtyRooms,
    pendingTestimonialsCount,
    hasPendingCancellations,
  } = useFOIndicators({ trainingMode });

  const indicators = {
    pendingBookingsCount,
    unreadMessagesCount,
    hasApprovedCheckIns,
    hasDueCheckOuts,
    hasDirtyRooms,
    pendingTestimonialsCount,
    hasPendingCancellations,
  };

  // Only show sidebar for FO and Admin
  if (!user || (role !== "fo" && role !== "admin")) return null;

  const links = role === "fo" ? FO_LINKS : ADMIN_LINKS;
  const roleLabel = role === "fo" ? "Front Office" : "Administrator";

  // Clear visited sections when navigating away
  useEffect(() => {
    const currentPath = location.pathname;
    // Mark current section as visited
    if (currentPath.startsWith('/fo/')) {
      setVisitedSections(prev => new Set([...prev, currentPath]));
    }
  }, [location.pathname]);

  // Helper function to determine if indicator should be shown
  const shouldShowIndicator = (linkPath, value) => {
    if (!value) return false;
    
    // Hide if currently on that section
    if (location.pathname === linkPath) return false;
    
    // Show if has data and not currently visited
    return !visitedSections.has(linkPath);
  };

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-background md:block">
      <div className="sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
        <div className="space-y-1 p-4">
          {/* Role badge */}
          <div className="mb-5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
              {roleLabel}
            </p>
          </div>

          {links.map((l) => {
            const Icon = l.icon;
            const notificationVal = l.notification ? indicators[l.notification.key] : null;
            const showNotification = l.notification ? shouldShowIndicator(l.to, notificationVal) : false;

            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end ?? false}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/20 text-foreground font-medium"
                      : "text-foreground/65 hover:bg-surface-hover hover:text-foreground/90",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{l.label}</span>
                
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
    </aside>
  );
}
