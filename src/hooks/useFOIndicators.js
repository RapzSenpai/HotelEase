import { useEffect, useState } from "react";
import { subscribeToBookingsPage, subscribeToPendingBookingRequests, subscribeToHasBookings } from "@/services/bookingsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
import { subscribeToMessages } from "@/services/messageService";
import { subscribeToRooms } from "@/services/roomsService";
import { subscribeToAllTestimonials } from "@/services/testimonialsService";

export function useFOIndicators({ role = null } = {}) {
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [hasApprovedCheckIns, setHasApprovedCheckIns] = useState(false);
  const [hasDueCheckOuts, setHasDueCheckOuts] = useState(false);
  const [hasDirtyRooms, setHasDirtyRooms] = useState(false);
  const [dirtyRoomsCount, setDirtyRoomsCount] = useState(0);
  const [pendingTestimonialsCount, setPendingTestimonialsCount] = useState(0);
  const [hasPendingCancellations, setHasPendingCancellations] = useState(false);
  const [hasPaymentsNeedingAttention, setHasPaymentsNeedingAttention] = useState(false);
  // Day key: the `tomorrow` cutoff below goes stale across midnight in a long
  // session. A 60s checker bumps the key at rollover, resubscribing the effect.
  const [dayKey, setDayKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  });

  useEffect(() => {
    const iv = setInterval(() => {
      const d = new Date();
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      setDayKey((prev) => (prev === k ? prev : k));
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    // Staff-only hook. Bail out for guests/signed-out states so a stale or
    // mistimed role can never attach FO/Admin-only Firestore listeners —
    // the rules would (correctly) deny them and spam permission errors.
    if (role !== "fo" && role !== "admin") return undefined;

    const unsubscribers = [];

    // 1. Pending bookings count
    const unsubPending = subscribeToPendingBookingRequests((bookings) => {
      setPendingBookingsCount(bookings.length);
    });
    unsubscribers.push(unsubPending);

    // 2. Unread messages count — the inbox is shared by FO + Admin per rules,
    //    so both roles subscribe.
    if (role === "admin" || role === "fo") {
      const unsubMessages = subscribeToMessages(
        (messages) => {
          const unreadCount = messages.filter((m) => m.status === "unread").length;
          setUnreadMessagesCount(unreadCount);
        });
      unsubscribers.push(unsubMessages);
    }

    // P2 scalability: badges only need existence, so three limit(1) live
    // queries replace the whole-collection subscription. Same semantics:
    // any Approved / due checkout / cancellation request flips its badge.
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    unsubscribers.push(
      subscribeToHasBookings({ status: "Approved"}, setHasApprovedCheckIns),
      subscribeToHasBookings(
        { status: "Checked In", checkOutBefore: tomorrow},
        setHasDueCheckOuts),
      subscribeToHasBookings(
        { status: "Cancellation Requested"},
        setHasPendingCancellations));

    // 5. Dirty / in-progress housekeeping rooms
    const unsubDirtyRooms = subscribeToRooms((rooms) => {
      const housekeepingRooms = rooms.filter((room) =>
        [
          "Dirty / Needs Cleaning",
          "Being Cleaned",
          "Pending Approval",
        ].includes(room.status));
      setHasDirtyRooms(housekeepingRooms.length > 0);
      setDirtyRoomsCount(housekeepingRooms.length);
    });
    unsubscribers.push(unsubDirtyRooms);

    // 6. Payments needing attention — any Approved / Checked In booking whose
    //    live paid sum (sum of payment records) is below totalCost. Attention
    //    indicator only: never blocks check-in, checkout balance gate unchanged.
    //    ponytail: bounded to one page per status; N small payments reads per change.
    let cancelled = false;
    let approvedBookings = [];
    let checkedInBookings = [];
    let recomputeSeq = 0;
    async function recomputePaymentsAttention() {
      const mySeq = ++recomputeSeq;
      const all = [...approvedBookings, ...checkedInBookings];
      if (all.length === 0) {
        if (!cancelled) setHasPaymentsNeedingAttention(false);
        return;
      }
      try {
        const flags = await Promise.all(
          all.map(async (b) => {
            const total = Number(b.totalCost ?? 0);
            if (!(total > 0)) return false;
            try {
              const recs = await listPaymentsForBooking(b.id);
              const paid = recs.reduce((s, p) => s + Number(p.amount ?? 0), 0);
              return paid < total;
            } catch {
              return total > 0;
            }
          }));
        if (!cancelled && mySeq === recomputeSeq)
          setHasPaymentsNeedingAttention(flags.some(Boolean));
      } catch {
        if (!cancelled && mySeq === recomputeSeq)
          setHasPaymentsNeedingAttention(false);
      }
    }
    unsubscribers.push(
      subscribeToBookingsPage({ status: "Approved"}, (list) => {
        approvedBookings = list;
        recomputePaymentsAttention();
      }),
      subscribeToBookingsPage({ status: "Checked In"}, (list) => {
        checkedInBookings = list;
        recomputePaymentsAttention();
      }));

    // 7. Pending testimonials — testimonials are admin-read-only for non-approved
    //    per rules, so only subscribe for the admin role.
    if (role === "admin") {
      const unsubTestimonials = subscribeToAllTestimonials((testimonials) => {
        const pendingCount = testimonials.filter((t) => t.status === "Pending").length;
        setPendingTestimonialsCount(pendingCount);
      });
      unsubscribers.push(unsubTestimonials);
    }

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [ role, dayKey]);

  return {
    pendingBookingsCount,
    unreadMessagesCount,
    hasApprovedCheckIns,
    hasDueCheckOuts,
    hasDirtyRooms,
    dirtyRoomsCount,
    pendingTestimonialsCount,
    hasPendingCancellations,
    hasPaymentsNeedingAttention};
}
