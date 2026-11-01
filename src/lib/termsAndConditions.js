/**
 * Shared Terms & Conditions content for HotelEase.
 *
 * Rendered by <TermsDialog /> across the Room Details and Booking flows so a
 * single source of truth is kept. If a room has its own `policies` value, that
 * room-specific rule is appended as an extra section.
 */

export const TERMS_TITLE = "Terms & Conditions";

/** Shown in the dialog header so guests know which rules they are agreeing to. */
export const TERMS_LAST_UPDATED = "October 30, 2026";

/**
 * Sections are { heading, body }. `body` may be a string of plain text (spaces
 * preserved) or an array of bullet strings rendered as a list.
 */
export const TERMS_SECTIONS = [
  {
    heading: "Booking & Reservation",
    body: [
      "All bookings are subject to room availability at the time of request and confirmation by Front Office staff.",
      "Submit your booking at least one (1) day prior to your intended check-in date.",
      "A valid government-issued ID and a valid contact number are required at check-in.",
      "Each guest may hold up to three (3) active bookings at a time (Awaiting Payment, Pending, or Approved). Cancel or complete an existing booking before making a new one.",
      "Early check-in (before 2:00 PM) and late check-out (after 12:00 NN) are subject to availability and additional charges, and must be arranged with Front Office.",
    ],
  },
  {
    heading: "Booking Statuses",
    body: [
      "Awaiting Payment: the booking was made with a payment method that requires proof (GCash or Bank Transfer) and no proof has been received yet. The dates are held for forty-eight (48) hours.",
      "Pending: payment has been submitted, or a pay-at-the-front-desk method was chosen, and the booking is waiting for Front Office approval. A booking with payment on file stays Pending until Front Office approves or rejects it.",
      "Approved (Reserved): Front Office has confirmed the booking. A confirmation email is sent once your booking is approved; submitting the form does not guarantee approval.",
      "Unpaid bookings are automatically cancelled when the 48-hour payment window ends, and the held dates are released for other guests.",
    ],
  },
  {
    heading: "Rates & Payment",
    body: [
      "Quoted rates are in Philippine Pesos (PHP) and are per night unless otherwise stated.",
      "Base rates cover the stated number of guests. Additional guests are charged a nightly extra-guest fee.",
      "GCash and Bank Transfer: send payment to the details shown at checkout, then upload a screenshot or receipt. The booking stays Awaiting Payment until proof is uploaded.",
      "Credit/Debit Card and Over-the-Counter: pay at the front desk. The booking goes straight to Pending for Front Office review.",
      "You may pay in full or partially. A partial payment must cover at least 50% of the total booking cost; the remaining balance is settled at check-in or as arranged with Front Office.",
      "Payment must be submitted within forty-eight (48) hours of booking creation. Unpaid bookings are released after the payment deadline.",
    ],
  },
  {
    heading: "Cancellation & No-Show Policy",
    body: [
      "Free cancellation until 24 hours before check-in: cancel on or before the deadline for a full refund of the amount paid.",
      "Late cancellation (under 24 hours) or no-show: a one-night charge applies. Refund = amount paid minus one night, floored at zero.",
      "Non-refundable rate: no refund unless Front Office records a manager override reason. Any override refund is capped at the amount paid.",
      "Unpaid bookings get no refund.",
      "Each guest account may cancel up to three (3) bookings. After that, contact Front Office for further cancellations.",
      "Cancelling never auto-refunds — refunds are a separate two-step: Front Office approves, then marks it paid. Refunds are sent manually through the channel you paid with (GCash, bank transfer) or handed over at the front desk for cash/over-the-counter payments.",
      "GCash and bank transfer refunds require a transaction reference number. Cash and over-the-counter refunds are recorded with an official receipt (OR) number or a received-by note.",
    ],
  },
  {
    heading: "House Rules",
    body: [
      "Smoking is strictly prohibited inside all guest rooms and enclosed hotel areas. Designated smoking areas are available on request.",
      "Pets are not allowed unless specifically confirmed with Front Office in advance.",
      "Quiet hours are observed from 10:00 PM to 6:00 AM. Please keep noise levels respectful for other guests.",
      "Damage to hotel property will be billed to the guest. Please report any pre-existing damage to Front Office upon check-in.",
    ],
  },
  {
    heading: "Liability & Privacy",
    body: [
      "The hotel is not liable for loss or damage to personal belongings left unattended in rooms or public areas.",
      "Personal information collected during booking is used solely to manage your reservation and is not shared with third parties except as required for payment processing.",
      "Prohibited items and disruptive behavior that endanger guests or staff may result in immediate termination of the stay without refund.",
    ],
  },
];

export function buildTermSections(extraPolicy) {
  if (!extraPolicy) return TERMS_SECTIONS;
  return [
    ...TERMS_SECTIONS,
    {
      heading: "Room-Specific Policy",
      body: extraPolicy,
    },
  ];
}
