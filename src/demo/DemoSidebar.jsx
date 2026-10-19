import { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { ADMIN_LINKS, FO_LINKS } from "@/lib/nav-links";
import { useDemo } from "./DemoContext";
import { demoPath } from "./routes";
import { DIRTY_ROOM_STATUSES } from "./fixtures";
import { openAlerts, pendingTestimonials } from "./admin/adminDemoData";
import { balanceOf } from "./fo/foDemoData";

// Fork of the production Sidebar chrome: same classes and grouping, but paths
// point into /demo and badges come from fixtures instead of Firestore listeners.
function Badge({ type, value }) {
  if (!value) return null;
  if (type === "count") {
    const count = Number(value);
    if (count <= 0) return null;
    return (
      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full border border-primary/10 bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
        {count > 99 ? "99+" : count}
      </span>
    );
  }
  return (
    <span className="relative mr-1 flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  );
}

export default function DemoSidebar({ role, open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, inbox } = useDemo();
  const groups = role === "admin" ? ADMIN_LINKS : FO_LINKS;

  const indicators = {
    pendingBookingsCount: data.bookings.filter((b) => b.status === "Pending").length,
    hasApprovedCheckIns: data.bookings.some((b) => b.status === "Approved"),
    hasDueCheckOuts: data.bookings.some((b) => b.status === "Checked In"),
    hasDirtyRooms: data.rooms.some((r) => DIRTY_ROOM_STATUSES.includes(r.status)),
    hasPaymentsNeedingAttention: data.bookings.some(
      (b) =>
        (b.status === "Approved" || b.status === "Checked In") &&
        balanceOf(b, data.payments) > 0,
    ),
    hasPendingCancellations: data.bookings.some((b) => b.status === "Cancelled"),
    unreadMessagesCount: inbox.filter((n) => !n.isRead).length,
    unresolvedAlertsCount: openAlerts(data.alerts).length,
    pendingTestimonialsCount: pendingTestimonials(data.testimonials).length,
  };

  // Same chrome as production: the mobile drawer closes whenever the route
  // changes (a link was followed or the exit landed elsewhere).
  useEffect(() => {
    onClose?.();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function links() {
    return groups.map((group, gi) => (
      <div key={group.group} className={gi > 0 ? "mt-4" : ""}>
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/30">
            {group.group}
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const Icon = item.icon;
            const value = item.notification ? indicators[item.notification.key] : null;
            const to = demoPath(item.to);
            return (
              <NavLink
                key={to}
                to={to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                    isActive
                      ? "bg-primary/15 font-medium text-foreground"
                      : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/85",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.notification && <Badge type={item.notification.type} value={value} />}
              </NavLink>
            );
          })}
        </div>
      </div>
    ));
  }

  const roleLabel = role === "admin" ? "Administrator" : "Front Office";

  const sidebarContent = (
    <div className="sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="p-3">
        {/* Mobile drawer header — role label + close, like production */}
        <div className="mb-3 flex items-center justify-between md:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            {roleLabel}
          </p>
          <button
            type="button"
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
          <p className="mt-0.5 text-[10px] text-foreground/50">Simulated demo data</p>
        </div>

        {links()}

        <div className="mt-4">
          <div className="mb-1.5 h-px bg-border/60" />
          <button
            type="button"
            onClick={() => {
              onClose?.();
              navigate("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground/60 transition-colors hover:bg-destructive/10 hover:font-medium hover:text-destructive"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">Exit demo</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — mirrors the production staff sidebar width/classes */}
      <aside className="hidden w-52 shrink-0 border-r border-border bg-background md:block">
        {sidebarContent}
      </aside>

      {/* Mobile — the production slide-out drawer (demo has no Navbar hamburger of its own) */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Demo navigation"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-background shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
