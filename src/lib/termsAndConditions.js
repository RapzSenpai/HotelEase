/**
 * Shared Terms & Conditions content for HotelEase.
 *
 * Rendered by <TermsDialog /> across the Room Details and Booking flows so a
 * single source of truth is kept. If a room has its own `policies` value, that
 * room-specific rule is appended as an extra section.
 */

export const TERMS_TITLE = "Terms & Conditions";

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
      "Early check-in (before 2:00 PM) and late check-out (after 12:00 NN) are subject to availability and additional charges, and must be arranged with Front Office.",
    ],
  },
{
    heading: "Rates & Payment",
    body: [
      "Quoted rates are in Philippine Pesos (PHP) and are per night unless otherwise stated.",
      "Base rates cover the stated number of guests. Additional guests are charged a nightly extra-guest fee.",
      "Payment must be settled at the time of booking via the available payment methods. Unpaid or unverified bookings may be released after the payment deadline.",
      "A confirmation email is sent once your booking is approved by Front Office. Submitting the form does not guarantee immediate approval.",
    ],
  },
  {
    heading: "Cancellation & No-Show Policy",
    body: [
      "Cancellations must be made at least twenty-four (24) hours before the scheduled check-in time to avoid charges.",
      "No-show or late-cancellation bookings may be forfeited and subject to a one-night charge.",
      "Partial cancellations handling, if permitted, is at the discretion of Front Office.",
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