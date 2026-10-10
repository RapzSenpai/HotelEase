/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useReducer } from "react";
import { buildDemoData, ts } from "./fixtures";

let demoSeq = 0;
function demoId(prefix) {
  demoSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${demoSeq}`;
}

function pushNotification(inbox, { type, title, message, link }) {
  return [
    { id: demoId("demo-n"), type, title, message, link, isRead: false, createdAt: ts(new Date()) },
    ...inbox,
  ];
}

function reducer(state, action) {
  const { data, inbox } = state;
  switch (action.type) {
    case "SET_ROLE":
      return { ...state, role: action.role };
    case "RESET":
      return { role: state.role, data: buildDemoData(new Date()), inbox: [] };
    case "GUEST_BOOK": {
      const room = data.rooms.find((r) => r.id === action.roomId);
      if (!room) return state;
      const nights = Math.min(Math.max(Math.round(Number(action.nights) || 2), 1), 14);
      const totalCost = room.ratePerNight * nights;
      const checkIn = new Date();
      const newBooking = {
        id: demoId("demo-bk"),
        guestId: "demo-guest-1",
        roomId: room.id,
        checkInDate: ts(checkIn),
        checkOutDate: ts(new Date(checkIn.getTime() + nights * 86400000)),
        nights,
        baseTotal: totalCost,
        totalCost,
        status: "Pending",
        bookingType: "Online",
        paxCount: 2,
        extraPaxCount: 0,
        extraPaxFee: 0,
        extraPaxTotal: 0,
        specialRequests: "",
        payment: { method: action.method || "Over-the-Counter", deposit: 0 },
        paymentProofUrl: null,
        paymentMethod: action.method || "Over-the-Counter",
        createdAt: ts(new Date()),
        updatedAt: ts(new Date()),
      };
      return {
        ...state,
        data: { ...data, bookings: [newBooking, ...data.bookings] },
        inbox: pushNotification(inbox, {
          type: "payment_proof_required",
          title: "Payment Proof Required",
          message: `Upload payment proof to complete your booking for ${room.name}`,
          link: "/demo/guest",
        }),
      };
    }
    case "GUEST_REVIEW": {
      const bookings = data.bookings.map((b) =>
        b.id === action.bookingId
          ? { ...b, demoRating: action.rating, demoFeedback: action.feedback || "" }
          : b,
      );
      return { ...state, data: { ...data, bookings } };
    }
    case "GUEST_REQUEST_CLEANING": {
      const booking = data.bookings.find((b) => b.id === action.bookingId);
      if (!booking) return state;
      const room = data.rooms.find((r) => r.id === booking.roomId);
      const requestId = demoId("demo-req");
      const log = {
        id: demoId("demo-hk"),
        roomId: booking.roomId,
        bookingId: booking.id,
        requestId,
        fromStatus: "Occupied / Checked In",
        toStatus: "Dirty / Needs Cleaning",
        changedByRole: "guest",
        changedByUserId: "demo-guest-1",
        changedByName: "Juan Dela Cruz",
        note: action.note ? `[Mid-Stay Request] ${action.note}` : "[Mid-Stay Request]",
        photoUrls: [],
        isMidStayRequest: true,
        createdAt: ts(new Date()),
      };
      const rooms = data.rooms.map((r) =>
        r.id === booking.roomId
          ? { ...r, status: "Dirty / Needs Cleaning", isMidStayRequest: true, midStayBookingId: booking.id, midStayRequestId: requestId }
          : r,
      );
      return {
        ...state,
        data: { ...data, rooms, housekeepingLogs: [log, ...data.housekeepingLogs] },
        inbox: pushNotification(inbox, {
          type: "midstay_requested",
          title: "Mid-Stay Cleaning Requested 🧹",
          message: `Guest requested cleaning for ${room?.name || "room"}.`,
          link: "/demo/fo",
        }),
      };
    }
    case "FO_APPROVE": {
      const bookings = data.bookings.map((b) =>
        b.id === action.bookingId ? { ...b, status: "Approved", updatedAt: ts(new Date()) } : b,
      );
      return {
        ...state,
        data: { ...data, bookings },
        inbox: pushNotification(inbox, {
          type: "booking_approved",
          title: "Booking Approved",
          message: "Your booking was approved by Front Office.",
          link: "/demo/guest",
        }),
      };
    }
    case "FO_CHECKIN": {
      const target = data.bookings.find((b) => b.id === action.bookingId);
      if (!target || target.status !== "Approved") return state;
      const bookings = data.bookings.map((b) =>
        b.id === action.bookingId ? { ...b, status: "Checked In", updatedAt: ts(new Date()) } : b,
      );
      return { ...state, data: { ...data, bookings } };
    }
    case "FO_CHECKOUT": {
      const target = data.bookings.find((b) => b.id === action.bookingId);
      if (!target || target.status !== "Checked In") return state;
      const bookings = data.bookings.map((b) =>
        b.id === action.bookingId ? { ...b, status: "Checked Out", updatedAt: ts(new Date()) } : b,
      );
      return { ...state, data: { ...data, bookings } };
    }
    case "GUEST_CANCEL": {
      const target = data.bookings.find((b) => b.id === action.bookingId);
      if (!target || (target.status !== "Pending" && target.status !== "Awaiting Payment")) return state;
      const bookings = data.bookings.map((b) =>
        b.id === action.bookingId ? { ...b, status: "Cancelled", updatedAt: ts(new Date()) } : b,
      );
      return { ...state, data: { ...data, bookings } };
    }
    case "FO_PAY": {
      const booking = data.bookings.find((b) => b.id === action.bookingId);
      if (!booking) return state;
      const paid = data.payments
        .filter((p) => p.bookingId === booking.id)
        .reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const balance = Math.max(0, Number(booking.totalCost ?? 0) - paid);
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > balance + 0.01) return state;
      const payment = {
        id: demoId("demo-pay"),
        bookingId: booking.id,
        amount,
        method: action.method || "Cash",
        note: null,
        source: "fo_manual",
        createdAt: ts(new Date()),
      };
      return {
        ...state,
        data: { ...data, payments: [payment, ...data.payments] },
        inbox: pushNotification(inbox, {
          type: "payment_received",
          title: "Payment Received",
          message: `₱${amount.toLocaleString()} recorded for your booking.`,
          link: "/demo/guest",
        }),
      };
    }
    case "FO_ADVANCE_CLEANING": {
      const target = data.housekeepingLogs.find((l) => l.requestId === action.requestId);
      if (!target) return state;
      const order = ["Dirty / Needs Cleaning", "Being Cleaned", "Pending Approval", "Available"];
      const latest = data.housekeepingLogs
        .filter((l) => l.requestId === action.requestId)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
      const next = order[order.indexOf(latest.toStatus) + 1];
      if (!next) return state;
      const room = data.rooms.find((r) => r.id === target.roomId);
      const log = {
        id: demoId("demo-hk"),
        roomId: target.roomId,
        bookingId: target.bookingId,
        requestId: action.requestId,
        fromStatus: latest.toStatus,
        toStatus: next,
        changedByRole: "fo",
        changedByUserId: "demo-fo-1",
        changedByName: "Cynthia Abell",
        note: "",
        photoUrls: [],
        isMidStayRequest: true,
        createdAt: ts(new Date()),
      };
      const rooms = data.rooms.map((r) =>
        r.id === target.roomId ? { ...r, status: next } : r,
      );
      const notes = {
        "Being Cleaned": { type: "housekeeping_in_progress", title: "Housekeeping in Progress 🧹", message: `Staff is currently cleaning your room (${room?.name || "room"}).` },
        Available: { type: "housekeeping_done", title: "Housekeeping Completed ✨", message: `Your room (${room?.name || "room"}) has been cleaned!` },
      };
      const note = notes[next];
      return {
        ...state,
        data: { ...data, rooms, housekeepingLogs: [log, ...data.housekeepingLogs] },
        inbox: note
          ? pushNotification(inbox, { ...note, link: "/demo/guest" })
          : inbox,
      };
    }
    case "ADMIN_ROOM": {
      const rooms = data.rooms.map((r) =>
        r.id === action.roomId ? { ...r, ...action.patch } : r,
      );
      return { ...state, data: { ...data, rooms } };
    }
    case "ADMIN_ROLE": {
      const users = data.users.map((u) =>
        u.id === action.userId ? { ...u, role: action.role } : u,
      );
      return { ...state, data: { ...data, users } };
    }
    case "NOTIFY": {
      return { ...state, inbox: pushNotification(inbox, action.notification) };
    }
    case "MARK_READ": {
      const inbox = state.inbox.map((n) =>
        n.id === action.id ? { ...n, isRead: true } : n,
      );
      return { ...state, inbox };
    }
    default:
      return state;
  }
}

const DemoContext = createContext(null);

export function DemoProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    role: null,
    data: buildDemoData(new Date()),
    inbox: [],
  }));

  const value = useMemo(() => {
    const notify = (notification) => dispatch({ type: "NOTIFY", notification });
    return {
      role: state.role,
      setRole: (role) => dispatch({ type: "SET_ROLE", role }),
      resetDemo: () => dispatch({ type: "RESET" }),
      data: state.data,
      inbox: state.inbox,
      demoMarkRead: (id) => dispatch({ type: "MARK_READ", id }),
      guest: {
        demoCreateBooking: (args) => dispatch({ type: "GUEST_BOOK", ...args }),
        // Same in-memory payment path Front Office uses, so the guest can finish
        // the simulated booking; the guard (amount ≤ balance) is shared.
        demoPayBooking: (args) => dispatch({ type: "FO_PAY", ...args }),
        demoSubmitReview: (args) => dispatch({ type: "GUEST_REVIEW", ...args }),
        demoRequestHousekeeping: (args) => dispatch({ type: "GUEST_REQUEST_CLEANING", ...args }),
        demoCancelBooking: ({ bookingId }) => dispatch({ type: "GUEST_CANCEL", bookingId }),
      },
      fo: {
        demoApproveBooking: ({ bookingId }) => dispatch({ type: "FO_APPROVE", bookingId }),
        demoCheckIn: ({ bookingId }) => dispatch({ type: "FO_CHECKIN", bookingId }),
        demoCheckOut: ({ bookingId }) => dispatch({ type: "FO_CHECKOUT", bookingId }),
        demoRecordPayment: (args) => dispatch({ type: "FO_PAY", ...args }),
        demoAdvanceCleaning: ({ requestId }) => dispatch({ type: "FO_ADVANCE_CLEANING", requestId }),
      },
      admin: {
        demoUpdateRoom: (args) => dispatch({ type: "ADMIN_ROOM", ...args }),
        demoSetUserRole: (args) => dispatch({ type: "ADMIN_ROLE", ...args }),
      },
      demoNotify: notify,
    };
  }, [state]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider.");
  return ctx;
}
