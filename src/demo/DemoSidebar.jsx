import { NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
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

export default function DemoSidebar({ role }) {
  const navigate = useNavigate();
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

  function links(compact) {
    return groups.map((group, gi) => (
      <div key={group.group} className={compact ? "flex items-center gap-1" : gi > 0 ? "mt-4" : ""}>
        {!compact && (
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/30">
              {group.group}
            </span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        )}
        <div className={compact ? "flex items-center gap-1" : "space-y-0.5"}>
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
                    compact && "shrink-0 whitespace-nowrap",
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

  return (
    <>
      {/* Desktop sidebar — mirrors the production staff sidebar width/classes */}
      <aside className="hidden w-52 shrink-0 border-r border-border bg-background md:block">
        <div className="sticky top-16 overflow-y-auto">
          <div className="p-3">
            <div className="mb-4 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                {role === "admin" ? "Administrator" : "Front Office"}
              </p>
              <p className="mt-0.5 text-[10px] text-foreground/50">Simulated demo data</p>
            </div>
            {links(false)}
            <div className="mt-4">
              <div className="mb-1.5 h-px bg-border/60" />
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground/60 transition-colors hover:bg-destructive/10 hover:font-medium hover:text-destructive"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">Exit demo</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile: same links as a scroll strip (demo has no Navbar hamburger) */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1 md:hidden">{links(true)}</div>
    </>
  );
}
