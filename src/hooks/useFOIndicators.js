import { useEffect, useState } from "react";
import { subscribeToPendingBookingRequests, subscribeToAllBookings } from "@/services/bookingsService";
import { subscribeToMessages } from "@/services/messageService";
import { subscribeToRooms } from "@/services/roomsService";
import { subscribeToAllTestimonials } from "@/services/testimonialsService";

export function useFOIndicators({ trainingMode = null, role = null } = {}) {
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [hasApprovedCheckIns, setHasApprovedCheckIns] = useState(false);
  const [hasDueCheckOuts, setHasDueCheckOuts] = useState(false);
  const [hasDirtyRooms, setHasDirtyRooms] = useState(false);
  const [dirtyRoomsCount, setDirtyRoomsCount] = useState(0);
  const [pendingTestimonialsCount, setPendingTestimonialsCount] = useState(0);
  const [hasPendingCancellations, setHasPendingCancellations] = useState(false);

  useEffect(() => {
    const unsubscribers = [];

    // 1. Pending bookings count
    const unsubPending = subscribeToPendingBookingRequests((bookings) => {
      setPendingBookingsCount(bookings.length);
    }, { trainingMode });
    unsubscribers.push(unsubPending);

    // 2. Unread messages count — messages are admin-read-only per rules, so
    //    only subscribe for the admin role.
    if (role === "admin") {
      const unsubMessages = subscribeToMessages((messages) => {
        const unreadCount = messages.filter((m) => m.status === "unread").length;
        setUnreadMessagesCount(unreadCount);
      });
      unsubscribers.push(unsubMessages);
    }

    // 3. Approved bookings (ready for check-in)
    const unsubApproved = subscribeToAllBookings((bookings) => {
      const approvedBookings = bookings.filter((b) => b.status === "Approved");
      setHasApprovedCheckIns(approvedBookings.length > 0);
    }, { trainingMode });
    unsubscribers.push(unsubApproved);

    // 4. Due check-outs (checked-in guests whose check-out date is today or past)
    const unsubCheckOuts = subscribeToAllBookings((bookings) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dueCheckOuts = bookings.filter((booking) => {
        if (booking.status !== "Checked In") return false;
        if (!booking.checkOutDate) return false;
        
        const checkOutDate = booking.checkOutDate.toDate ? 
          booking.checkOutDate.toDate() : 
          new Date(booking.checkOutDate);
        checkOutDate.setHours(0, 0, 0, 0);
        return checkOutDate <= today;
      });
      setHasDueCheckOuts(dueCheckOuts.length > 0);
    }, { trainingMode });
    unsubscribers.push(unsubCheckOuts);

    // 5. Dirty / in-progress housekeeping rooms
    const unsubDirtyRooms = subscribeToRooms((rooms) => {
      const housekeepingRooms = rooms.filter((room) =>
        [
          "Dirty / Needs Cleaning",
          "Being Cleaned",
          "Pending Approval",
        ].includes(room.status),
      );
      setHasDirtyRooms(housekeepingRooms.length > 0);
      setDirtyRoomsCount(housekeepingRooms.length);
    }, { trainingMode });
    unsubscribers.push(unsubDirtyRooms);

    // 6. Pending testimonials — testimonials are admin-read-only for non-approved
    //    per rules, so only subscribe for the admin role.
    if (role === "admin") {
      const unsubTestimonials = subscribeToAllTestimonials((testimonials) => {
        const pendingCount = testimonials.filter((t) => t.status === "Pending").length;
        setPendingTestimonialsCount(pendingCount);
      });
      unsubscribers.push(unsubTestimonials);
    }

    // 7. Cancellation Requests (status === "Cancellation Requested")
    const unsubCancellations = subscribeToAllBookings((bookings) => {
      const cancellationRequests = bookings.filter((b) => b.status === "Cancellation Requested");
      setHasPendingCancellations(cancellationRequests.length > 0);
    }, { trainingMode });
    unsubscribers.push(unsubCancellations);

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [trainingMode, role]);

  return {
    pendingBookingsCount,
    unreadMessagesCount,
    hasApprovedCheckIns,
    hasDueCheckOuts,
    hasDirtyRooms,
    dirtyRoomsCount,
    pendingTestimonialsCount,
    hasPendingCancellations,
  };
}
