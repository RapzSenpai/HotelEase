import { createElement, lazy } from "react";
import { ADMIN_LINKS, FO_LINKS } from "@/lib/nav-links";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoFixtureTable from "./DemoFixtureTable";
import DemoSectionPage from "./DemoSectionPage";

/** Production nav path -> demo tree path: /fo/bookings -> /demo/fo/bookings. */
export const demoPath = (to) => (to.startsWith("/demo") ? to : `/demo${to}`);

// L2 sections: scripted fixture pages. Role index routes (/fo, /admin) are
// registered here too, so every nav item has exactly one entry point.
const SECTION_PAGES = {
  "/fo": lazy(() => import("./fo/DemoFoDashboard")),
  "/fo/bookings": lazy(() => import("./fo/DemoFoBookings")),
  "/fo/check-in": lazy(() => import("./fo/DemoFoCheckIn")),
  "/fo/check-out": lazy(() => import("./fo/DemoFoCheckOut")),
  "/fo/payments": lazy(() => import("./fo/DemoFoPayments")),
  "/fo/housekeeping": lazy(() => import("./fo/DemoFoHousekeeping")),
  "/admin": lazy(() => import("./admin/DemoAdminAnalytics")),
  "/admin/operations": lazy(() => import("./admin/DemoAdminOperations")),
  "/admin/users": lazy(() => import("./admin/DemoAdminUsers")),
  "/admin/rooms": lazy(() => import("./admin/DemoAdminRooms")),
};

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const humanize = (value) => value.replace(/_/g, " ");

// Shared between the FO and admin nav items that render the same inbox.
const MESSAGES_TABLE = {
  columns: ["From", "Role", "Subject", "Status"],
  rows: (data) =>
    data.messages.map((m) => ({
      id: m.id,
      cells: [m.fromName, m.fromRole === "guest" ? "Guest" : "Front office", m.subject, m.status],
    })),
};

const FO_TABLES = {
  "/fo/cancellations": {
    columns: ["Room", "Stay", "Nights", "Refund", "Refund status"],
    rows: (data) => {
      const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
      return data.bookings
        .filter((b) => b.status === "Cancelled")
        .map((b) => {
          const refund = data.refunds.find((r) => r.bookingId === b.id);
          return {
            id: b.id,
            cells: [
              roomLabelFrom(roomsById, b.roomId),
              formatDate(b.checkInDate.toDate()),
              b.nights,
              refund ? formatCurrency(refund.amount) : "—",
              refund ? refund.status : "No refund on file",
            ],
          };
        });
    },
  },
  "/fo/announcements": {
    columns: ["Announcement", "Audience", "Posted by", "Posted"],
    rows: (data) =>
      data.announcements.map((a) => ({
        id: a.id,
        cells: [a.title, a.audience, a.createdByName, formatDate(a.createdAt.toDate())],
      })),
  },
  "/fo/messages": MESSAGES_TABLE,
};

const ADMIN_TABLES = {
  "/admin/messages": MESSAGES_TABLE,
  "/admin/testimonials": {
    columns: ["Guest", "Rating", "Feedback", "Status", "Submitted"],
    rows: (data) =>
      data.testimonials.map((t) => ({
        id: t.id,
        cells: [t.guestName, `${t.rating}/5`, t.feedback, titleCase(t.status), formatDate(t.createdAt.toDate())],
      })),
  },
  "/admin/alerts": {
    columns: ["Alert", "Severity", "Source", "Status", "Raised"],
    rows: (data) =>
      data.alerts.map((a) => ({
        id: a.id,
        cells: [a.title, titleCase(a.severity), titleCase(a.source), titleCase(a.status), formatDate(a.createdAt.toDate())],
      })),
  },
  "/admin/health": {
    columns: ["Check", "Status", "Latency", "Last checked"],
    rows: (data) =>
      data.healthChecks.map((h) => ({
        id: h.id,
        cells: [h.name, titleCase(h.status), `${h.latencyMs} ms`, formatDate(h.checkedAt.toDate())],
      })),
  },
  "/admin/performance": {
    columns: ["Metric", "Measured", "Budget", "Status"],
    rows: (data) =>
      data.performanceMetrics.map((m) => ({
        id: m.id,
        cells: [m.name, m.value, m.budget, m.status],
      })),
  },
  "/admin/availability": {
    columns: ["Room", "Status", "Upcoming stays", "Next arrival"],
    rows: (data) =>
      data.rooms.map((room) => {
        const upcoming = data.bookings
          .filter(
            (b) =>
              b.roomId === room.id &&
              ["Pending", "Awaiting Payment", "Approved", "Checked In"].includes(b.status),
          )
          .sort((a, b) => a.checkInDate.toMillis() - b.checkInDate.toMillis());
        return {
          id: room.id,
          cells: [
            room.name,
            room.status,
            upcoming.length,
            upcoming.length ? formatDate(upcoming[0].checkInDate.toDate()) : "—",
          ],
        };
      }),
  },
  "/admin/audit-logs": {
    columns: ["When", "Actor", "Role", "Action", "Target"],
    rows: (data) =>
      data.auditLogs.map((l) => ({
        id: l.id,
        cells: [
          formatDate(l.createdAt.toDate()),
          l.actorName,
          l.actorRole === "admin" ? "Admin" : "Front office",
          titleCase(humanize(l.action)),
          l.targetLabel,
        ],
      })),
  },
  "/admin/settings": {
    columns: ["Setting", "Value", "Scope"],
    rows: (data) =>
      data.settings.map((s) => ({ id: s.id, cells: [s.label, s.value, s.scope] })),
  },
};

// L1 sections: view-only fixture tables, no actions by design.
const SECTION_TABLES = { ...FO_TABLES, ...ADMIN_TABLES };

/** Every configured section path — pinned to the nav-derived table by test. */
export const SECTION_CONFIG_PATHS = [
  ...Object.keys(SECTION_PAGES),
  ...Object.keys(SECTION_TABLES),
];

function toSections(groups, role, indexPath) {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      role,
      group: group.group,
      label: item.label,
      prodPath: item.to,
      path: demoPath(item.to),
      index: item.to === indexPath,
    })),
  );
}

// Route table is derived from the same data the demo sidebar renders, so a nav
// item without a route (or vice versa) cannot exist.
export const STAFF_SECTIONS = [
  ...toSections(FO_LINKS, "fo", "/fo"),
  ...toSections(ADMIN_LINKS, "admin", "/admin"),
];

/** L2 page, else L1 fixture table, else the placeholder. */
export function sectionElement(section) {
  const Page = SECTION_PAGES[section.prodPath];
  if (Page) return createElement(Page);
  const table = SECTION_TABLES[section.prodPath];
  if (table) {
    return createElement(DemoFixtureTable, {
      ...table,
      label: section.label,
      role: section.role,
    });
  }
  return createElement(DemoSectionPage, { label: section.label, role: section.role });
}
