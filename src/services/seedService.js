/**
 * Phase 1: seed placeholders
 *
 * Overview requirements:
 * - Set up Firestore data models and seed data
 * - Training mode must use separate collections prefixed with `training_`
 *
 * seedBaseData() intentionally does not write to Firestore yet — production
 * data is managed through normal admin CRUD.
 *
 * seedTrainingData() writes a small, realistic demo dataset into the training
 * sandbox ONLY (training_rooms, training_guests, training_bookings,
 * training_payments) so a training session is not an empty shell. Production
 * collections are never touched. Stable doc IDs make re-seeding idempotent
 * (setDoc overwrites the same docs).
 */

import {
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

const TRAINING_ROOMS_COL = "training_rooms";
const TRAINING_GUESTS_COL = "training_guests";
const TRAINING_BOOKINGS_COL = "training_bookings";
const TRAINING_PAYMENTS_COL = "training_payments";

function daysFromNow(days, hour = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function calcNights(checkIn, checkOut) {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
}

const ROOMS = [
  {
    id: "seed-101",
    roomNumber: "101",
    name: "Sunrise Single",
    type: "Single Room",
    status: "Available",
    ratePerNight: 1200,
    floor: "Ground Floor",
    description: "Cozy single room facing the garden — perfect for a short solo stay.",
    amenities: ["Free WiFi", "Air Conditioning", "Hot Shower"],
    basePax: 1,
    maxPax: 2,
    extraPaxFee: 300,
    isActive: true,
  },
  {
    id: "seed-102",
    roomNumber: "102",
    name: "Ocean View Single",
    type: "Single Room",
    status: "Dirty / Needs Cleaning",
    ratePerNight: 1200,
    floor: "Ground Floor",
    description: "Single room with an ocean view — being turned over for the next guest.",
    amenities: ["Free WiFi", "Air Conditioning"],
    basePax: 1,
    maxPax: 2,
    extraPaxFee: 300,
    isActive: true,
  },
  {
    id: "seed-103",
    roomNumber: "103",
    name: "Cebu Suite",
    type: "Suite Room",
    status: "Available",
    ratePerNight: 3500,
    floor: "1st Floor",
    description: "Spacious suite with a separate living area.",
    amenities: ["Free WiFi", "Air Conditioning", "Living Area", "Mini Bar"],
    basePax: 2,
    maxPax: 4,
    extraPaxFee: 500,
    isActive: true,
  },
  {
    id: "seed-104",
    roomNumber: "104",
    name: "Leyte Suite",
    type: "Suite Room",
    status: "Occupied",
    ratePerNight: 3500,
    floor: "1st Floor",
    description: "Family-friendly suite, currently occupied by a guest.",
    amenities: ["Free WiFi", "Air Conditioning", "Living Area", "Bath Tub"],
    basePax: 2,
    maxPax: 4,
    extraPaxFee: 500,
    isActive: true,
  },
  {
    id: "seed-105",
    roomNumber: "105",
    name: "Presidential Suite",
    type: "Presidential Room",
    status: "Reserved",
    ratePerNight: 8000,
    floor: "2nd Floor",
    description: "Our flagship suite with a jacuzzi and private dining area.",
    amenities: ["Free WiFi", "Air Conditioning", "Jacuzzi", "Dining Area", "Balcony"],
    basePax: 4,
    maxPax: 8,
    extraPaxFee: 1000,
    isActive: true,
  },
  {
    id: "seed-106",
    roomNumber: "106",
    name: "Bohol Single",
    type: "Single Room",
    status: "Available",
    ratePerNight: 1300,
    floor: "Ground Floor",
    description: "Single room with a city view.",
    amenities: ["Free WiFi", "Air Conditioning"],
    basePax: 1,
    maxPax: 2,
    extraPaxFee: 300,
    isActive: true,
  },
];

const GUESTS = [
  {
    uid: "seed-guest-001",
    email: "juan.demo@hotelease.ph",
    fullName: "Juan Dela Cruz",
    phone: "0917 000 0001",
    role: "guest",
  },
  {
    uid: "seed-guest-002",
    email: "maria.demo@hotelease.ph",
    fullName: "Maria Clara Santos",
    phone: "0917 000 0002",
    role: "guest",
  },
  {
    uid: "seed-guest-003",
    email: "pedro.demo@hotelease.ph",
    fullName: "Pedro Reyes",
    phone: "0917 000 0003",
    role: "guest",
  },
  {
    uid: "seed-fo-001",
    email: "cynthia.demo@hotelease.ph",
    fullName: "Cynthia Abell",
    phone: "0917 000 0040",
    role: "fo",
  },
  {
    uid: "seed-admin-001",
    email: "edwin.demo@hotelease.ph",
    fullName: "Edwin Marquez",
    phone: "0917 000 0099",
    role: "admin",
  },
];

// One booking per lifecycle status so every screen has something to show.
const BOOKINGS = [
  // ✓ Pending — Front Office can approve it (no-proof method → Pending)
  {
    id: "seed-bk-101",
    guestId: "seed-guest-001",
    roomId: "seed-103",
    status: "Pending",
    method: "Over-the-Counter",
    nights: 2,
    ratePerNight: 3500,
    checkIn: daysFromNow(5),
    deposit: 0,
  },
  // ✓ Awaiting Payment — guest still needs to upload GCash proof
  {
    id: "seed-bk-102",
    guestId: "seed-guest-001",
    roomId: "seed-101",
    status: "Awaiting Payment",
    method: "GCash",
    nights: 1,
    ratePerNight: 1200,
    checkIn: daysFromNow(6),
    deposit: 0,
  },
  // ✓ Approved — room seed-105 is Reserved (matches its room status)
  {
    id: "seed-bk-103",
    guestId: "seed-guest-002",
    roomId: "seed-105",
    status: "Approved",
    method: "Over-the-Counter",
    nights: 2,
    ratePerNight: 8000,
    checkIn: daysFromNow(4),
    deposit: 0,
  },
  // ✓ Checked In — room seed-104 is Occupied
  {
    id: "seed-bk-104",
    guestId: "seed-guest-003",
    roomId: "seed-104",
    status: "Checked In",
    method: "Over-the-Counter",
    nights: 2,
    ratePerNight: 3500,
    checkIn: daysFromNow(0),
    deposit: 3500,
  },
  // ✓ Checked Out — for history/analytics; room seed-102 left Dirty
  {
    id: "seed-bk-105",
    guestId: "seed-guest-003",
    roomId: "seed-102",
    status: "Checked Out",
    method: "Over-the-Counter",
    nights: 1,
    ratePerNight: 1200,
    checkIn: daysFromNow(-4),
    deposit: 1200,
  },
];

function buildBooking(spec) {
  const checkInDate = Timestamp.fromDate(spec.checkIn);
  const checkOutDate = Timestamp.fromDate(
    new Date(spec.checkIn.getTime() + spec.nights * 24 * 60 * 60 * 1000),
  );
  const nights = calcNights(spec.checkIn, checkOutDate.toDate());
  const totalCost = Number(spec.ratePerNight) * nights;
  const deposit = Number(spec.deposit ?? 0);
  return {
    guestId: spec.guestId,
    roomId: spec.roomId,
    checkInDate: checkInDate,
    checkOutDate: checkOutDate,
    nights,
    baseTotal: totalCost,
    totalCost,
    status: spec.status,
    bookingType: "Online",
    paxCount: 2,
    extraPaxCount: 0,
    extraPaxFee: 0,
    extraPaxTotal: 0,
    specialRequests: "",
    leadGuestName: null,
    leadGuestEmail: null,
    leadGuestPhone: null,
    arrivalTime: "I don't know",
    payment: { method: spec.method, deposit },
    paymentProofUrl: null,
    paymentMethod: spec.method,
    paymentType: null,
    paymentDeadline: Timestamp.fromDate(daysFromNow(2, 23)),
    proofUploadedAt: null,
    proofVerifiedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function seedBaseData() {
  // Deliberately a no-op in this demo — production data is managed via admin tooling.
  return { ok: true, seeded: 0, note: "Only training data is seeded on demand." };
}

/**
 * Populate the training sandbox with a realistic demo dataset.
 * Idempotent — re-running overwrites the same stable document IDs.
 *
 * @returns {Promise<{ ok: true, counts: { rooms, guests, bookings, payments } }>}
 */
export async function seedTrainingData() {
  const writes = [];

  for (const r of ROOMS) {
    writes.push(
      setDoc(doc(db, TRAINING_ROOMS_COL, r.id), {
        roomNumber: r.roomNumber,
        name: r.name,
        type: r.type,
        status: r.status,
        ratePerNight: Number(r.ratePerNight),
        description: r.description,
        floor: r.floor,
        amenities: r.amenities,
        policies: "",
        checkInTime: "14:00",
        checkOutTime: "12:00",
        basePax: Number(r.basePax),
        maxPax: Number(r.maxPax),
        extraPaxFee: Number(r.extraPaxFee),
        facilities: [],
        photos: [],
        isActive: r.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  for (const g of GUESTS) {
    writes.push(
      setDoc(
        doc(db, TRAINING_GUESTS_COL, g.uid),
        {
          uid: g.uid,
          email: g.email,
          fullName: g.fullName,
          phone: g.phone,
          role: g.role,
          emailVerified: true,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  }

  const bookingIdByStatus = {};
  for (const spec of BOOKINGS) {
    bookingIdByStatus[spec.status] = spec.id;
    writes.push(setDoc(doc(db, TRAINING_BOOKINGS_COL, spec.id), buildBooking(spec)));
  }

  writes.push(
    setDoc(
      doc(db, TRAINING_PAYMENTS_COL, "seed-pay-001"),
      {
        bookingId: bookingIdByStatus["Checked In"],
        amount: 3500,
        method: "Over-the-Counter",
        note: "Deposit collected at check-in (demo)",
        methodDetails: {},
        receiptNo: "RCP-TRAIN-0001",
        receiptGeneratedAt: serverTimestamp(),
        processedBy: "Front Office Staff",
        source: "fo_manual",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    ),
  );

  await Promise.all(writes);

  return {
    ok: true,
    counts: {
      rooms: ROOMS.length,
      guests: GUESTS.length,
      bookings: BOOKINGS.length,
      payments: 1,
    },
  };
}