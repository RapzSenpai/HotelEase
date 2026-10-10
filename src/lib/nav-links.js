import {
  LayoutDashboard,
  LogIn,
  LogOut,
  Sparkles,
  CreditCard,
  Megaphone,
  CalendarDays,
  BarChart3,
  Users,
  Building2,
  Settings,
  Mail,
  MessageSquareQuote,
  XCircle,
  ClipboardList,
  Activity,
  Shield,
  Bell,
  Gauge,
} from "lucide-react";

// Sidebar nav is data, not markup: the demo renders the same groups through
// `demoPath` so demo labels/order/icons cannot drift from production.
// Keep this module import-free of services/firebase — the demo tree imports it.
export const FO_LINKS = [
  {
    group: "Daily Operations",
    items: [
      { to: "/fo", label: "Dashboard", icon: LayoutDashboard, end: true },
      {
        to: "/fo/housekeeping",
        label: "Housekeeping",
        icon: Sparkles,
        notification: { type: "dot", key: "hasDirtyRooms" },
      },
    ],
  },
  {
    group: "Guest Stay",
    expandable: true,
    items: [
      {
        to: "/fo/bookings",
        label: "Bookings",
        icon: CalendarDays,
        notification: { type: "count", key: "pendingBookingsCount" },
      },
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
        to: "/fo/payments",
        label: "Payments",
        icon: CreditCard,
        notification: { type: "dot", key: "hasPaymentsNeedingAttention" },
      },
      {
        to: "/fo/cancellations",
        label: "Cancellations & Refunds",
        icon: XCircle,
        notification: { type: "dot", key: "hasPendingCancellations" },
      },
    ],
  },
  {
    group: "Communication",
    items: [
      {
        to: "/fo/messages",
        label: "Messages",
        icon: Mail,
        notification: { type: "count", key: "unreadMessagesCount" },
      },
      { to: "/fo/announcements", label: "Announcements", icon: Megaphone },
    ],
  },
];

export const ADMIN_LINKS = [
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
      { to: "/admin/availability", label: "Availability", icon: CalendarDays },
      { to: "/admin/performance", label: "Performance", icon: Gauge },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: Shield },
      { to: "/admin/settings", label: "System Settings", icon: Settings },
    ],
  },
];
