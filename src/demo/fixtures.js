/**
 * Frontend-only demo fixtures. Shapes mirror `seedTrainingData` in
 * src/services/seedService.js (read-only reference — never imported, so the
 * demo tree stays backend-free). Every call deep-clones: no two callers
 * share references, so `resetDemo()` can never leak mutated state.
 */

export function ts(date) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  return {
    seconds: Math.floor(ms / 1000),
    toDate: () => new Date(ms),
    toMillis: () => ms,
  };
}

function daysFrom(base, days, hour = 14) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function booking(spec, now) {
  const checkIn = daysFrom(now, spec.checkInOffset);
  const checkOut = new Date(checkIn.getTime() + spec.nights * 86400000);
  const totalCost = spec.ratePerNight * spec.nights;
  return {
    id: spec.id,
    guestId: spec.guestId,
    roomId: spec.roomId,
    checkInDate: ts(checkIn),
    checkOutDate: ts(checkOut),
    nights: spec.nights,
    baseTotal: totalCost,
    totalCost,
    status: spec.status,
    bookingType: "Online",
    paxCount: 2,
    extraPaxCount: 0,
    extraPaxFee: 0,
    extraPaxTotal: 0,
    specialRequests: "",
    payment: { method: spec.method, deposit: spec.deposit ?? 0 },
    paymentProofUrl: null,
    paymentMethod: spec.method,
    createdAt: ts(now),
    updatedAt: ts(now),
  };
}

export function buildDemoData(now = new Date()) {
  const rooms = [
    { id: "demo-101", roomNumber: "101", name: "Sunrise Single", type: "Single Room", status: "Available", ratePerNight: 1200, floor: "Ground Floor", description: "Cozy single room facing the garden.", amenities: ["Free WiFi", "Air Conditioning"], basePax: 1, maxPax: 2, extraPaxFee: 300, isActive: true },
    { id: "demo-102", roomNumber: "102", name: "Ocean View Single", type: "Single Room", status: "Dirty / Needs Cleaning", ratePerNight: 1200, floor: "Ground Floor", description: "Single room with an ocean view.", amenities: ["Free WiFi", "Air Conditioning"], basePax: 1, maxPax: 2, extraPaxFee: 300, isActive: true },
    { id: "demo-103", roomNumber: "103", name: "Cebu Suite", type: "Suite Room", status: "Available", ratePerNight: 3500, floor: "1st Floor", description: "Spacious suite with a separate living area.", amenities: ["Free WiFi", "Air Conditioning", "Mini Bar"], basePax: 2, maxPax: 4, extraPaxFee: 500, isActive: true },
    { id: "demo-104", roomNumber: "104", name: "Leyte Suite", type: "Suite Room", status: "Occupied / Checked In", ratePerNight: 3500, floor: "1st Floor", description: "Family-friendly suite, currently occupied.", amenities: ["Free WiFi", "Air Conditioning", "Bath Tub"], basePax: 2, maxPax: 4, extraPaxFee: 500, isActive: true },
    { id: "demo-105", roomNumber: "105", name: "Presidential Suite", type: "Presidential Room", status: "Reserved", ratePerNight: 8000, floor: "2nd Floor", description: "Flagship suite with jacuzzi.", amenities: ["Free WiFi", "Jacuzzi", "Balcony"], basePax: 4, maxPax: 8, extraPaxFee: 1000, isActive: true },
    { id: "demo-106", roomNumber: "106", name: "Bohol Single", type: "Single Room", status: "Being Cleaned", ratePerNight: 1300, floor: "Ground Floor", description: "Single room with a city view.", amenities: ["Free WiFi", "Air Conditioning"], basePax: 1, maxPax: 2, extraPaxFee: 300, isActive: true },
  ];

  const users = [
    { id: "demo-guest-1", uid: "demo-guest-1", email: "juan.demo@hotelease.ph", fullName: "Juan Dela Cruz", role: "guest" },
    { id: "demo-fo-1", uid: "demo-fo-1", email: "cynthia.demo@hotelease.ph", fullName: "Cynthia Abell", role: "fo" },
    { id: "demo-admin-1", uid: "demo-admin-1", email: "edwin.demo@hotelease.ph", fullName: "Edwin Marquez", role: "admin" },
  ];

  const bookings = [
    booking({ id: "demo-bk-pending", guestId: "demo-guest-1", roomId: "demo-103", status: "Pending", method: "Over-the-Counter", nights: 2, ratePerNight: 3500, checkInOffset: 5 }, now),
    booking({ id: "demo-bk-awaiting", guestId: "demo-guest-1", roomId: "demo-101", status: "Awaiting Payment", method: "GCash", nights: 1, ratePerNight: 1200, checkInOffset: 6 }, now),
    booking({ id: "demo-bk-approved", guestId: "demo-guest-1", roomId: "demo-105", status: "Approved", method: "Over-the-Counter", nights: 2, ratePerNight: 8000, checkInOffset: 4 }, now),
    booking({ id: "demo-bk-checkedin", guestId: "demo-guest-1", roomId: "demo-104", status: "Checked In", method: "Over-the-Counter", nights: 2, ratePerNight: 3500, checkInOffset: 0, deposit: 3500 }, now),
    booking({ id: "demo-bk-checkedout", guestId: "demo-guest-1", roomId: "demo-102", status: "Checked Out", method: "Over-the-Counter", nights: 1, ratePerNight: 1200, checkInOffset: -4, deposit: 1200 }, now),
  ];

  const payments = [
    { id: "demo-pay-1", bookingId: "demo-bk-checkedin", amount: 3500, method: "Cash", note: null, source: "fo_manual", createdAt: ts(daysFrom(now, 0)) },
    { id: "demo-pay-2", bookingId: "demo-bk-checkedout", amount: 1200, method: "GCash", note: "PAY-123", source: "guest_proof", createdAt: ts(daysFrom(now, -4)) },
    { id: "demo-pay-3", bookingId: "demo-bk-approved", amount: 2000, method: "GCash", note: "PARTIAL-1", source: "guest_proof", createdAt: ts(daysFrom(now, 3)) },
  ];

  const housekeepingLogs = [
    { id: "demo-hk-1", roomId: "demo-104", bookingId: "demo-bk-checkedin", requestId: "demo-req-1", fromStatus: "Occupied / Checked In", toStatus: "Dirty / Needs Cleaning", changedByRole: "guest", changedByUserId: "demo-guest-1", changedByName: "Juan Dela Cruz", note: "[Mid-Stay Request] Fresh towels", photoUrls: [], isMidStayRequest: true, createdAt: ts(daysFrom(now, 0, 9)) },
    { id: "demo-hk-2", roomId: "demo-104", bookingId: "demo-bk-checkedin", requestId: "demo-req-1", fromStatus: "Dirty / Needs Cleaning", toStatus: "Being Cleaned", changedByRole: "fo", changedByUserId: "demo-fo-1", changedByName: "Cynthia Abell", note: "", photoUrls: [], isMidStayRequest: true, createdAt: ts(daysFrom(now, 0, 10)) },
    { id: "demo-hk-3", roomId: "demo-102", bookingId: "demo-bk-checkedout", requestId: "demo-req-0", fromStatus: "Being Cleaned", toStatus: "Available", changedByRole: "fo", changedByUserId: "demo-fo-1", changedByName: "Cynthia Abell", note: "", photoUrls: [], isMidStayRequest: false, createdAt: ts(daysFrom(now, -3, 11)) },
    { id: "demo-hk-4", roomId: "demo-102", bookingId: "demo-bk-checkedout", requestId: "demo-req-0", fromStatus: "Occupied / Checked In", toStatus: "Dirty / Needs Cleaning", changedByRole: "guest", changedByUserId: "demo-guest-1", changedByName: "Juan Dela Cruz", note: "[Mid-Stay Request] Deep clean", photoUrls: [], isMidStayRequest: true, createdAt: ts(daysFrom(now, -3, 9)) },
  ];

  const notifications = [
    { id: "demo-n1", type: "booking_request", title: "New Booking Request", message: "Juan Dela Cruz requested Cebu Suite", link: "/demo/fo", isRead: false, createdAt: ts(daysFrom(now, 5, 8)) },
    { id: "demo-n2", type: "midstay_requested", title: "Mid-Stay Cleaning Requested 🧹", message: "Guest requested cleaning for Leyte Suite", link: "/demo/fo", isRead: false, createdAt: ts(daysFrom(now, 0, 9)) },
    { id: "demo-n3", type: "housekeeping_in_progress", title: "Housekeeping in Progress 🧹", message: "Staff is currently cleaning your room (Leyte Suite).", link: "/demo/guest", isRead: false, createdAt: ts(daysFrom(now, 0, 10)) },
    { id: "demo-n4", type: "payment_received", title: "Payment Received", message: "₱3,500 recorded for Leyte Suite", link: "/demo/guest", isRead: true, createdAt: ts(daysFrom(now, 0, 8)) },
  ];

  return { rooms, users, bookings, payments, housekeepingLogs, notifications };
}
