// Demo values for capstone presentation — not a real merchant account
// Replace with actual hotel payment details in production

// Payment methods that require proof upload
export const PROOF_REQUIRED_METHODS = ["GCash", "Bank Transfer"];

// GCash details
export const HOTEL_GCASH_NUMBER = "0917-123-4567";
export const HOTEL_GCASH_QR_IMAGE_URL = null; // Add your GCash QR code image URL here

// Bank transfer details
export const HOTEL_BANK_NAME = "Banco de Oro (BDO)";
export const HOTEL_BANK_ACCOUNT_NUMBER = "1234-5678-9012";
export const HOTEL_BANK_ACCOUNT_NAME = "HotelEase Demo Account";

// Over-the-counter instructions
export const HOTEL_OTC_INSTRUCTIONS = "Pay the amount due at the hotel front desk upon arrival. Your booking will be reviewed by Front Office staff — no online proof upload is required.";

// Credit/Debit card instructions
export const HOTEL_CARD_INSTRUCTIONS = "Pay using your credit or debit card at the hotel front desk upon arrival. Your booking will be reviewed by Front Office staff — no online proof upload is required.";

// Partial payment configuration
export const PARTIAL_PAYMENT_PERCENTAGE = 0.5; // 50% of total cost for partial payment

/**
 * Calculate partial payment amount based on total cost
 * @param {number} totalCost - The total booking cost
 * @returns {number} The partial payment amount (50% of total)
 */
export function calculatePartialPayment(totalCost) {
  return Math.round(totalCost * PARTIAL_PAYMENT_PERCENTAGE);
}

/**
 * Get payment details for a specific payment method
 * @param {string} method - The payment method (GCash, Bank Transfer, Credit/Debit Card, Over-the-Counter)
 * @returns {object} Payment details for the method
 */
export function getPaymentDetails(method) {
  switch (method) {
    case "GCash":
      return {
        name: "GCash",
        number: HOTEL_GCASH_NUMBER,
        instructions: `Send payment to the GCash number above and upload your screenshot as proof.`,
      };
    case "Bank Transfer":
      return {
        name: "Bank Transfer",
        bankName: HOTEL_BANK_NAME,
        accountNumber: HOTEL_BANK_ACCOUNT_NUMBER,
        accountName: HOTEL_BANK_ACCOUNT_NAME,
        instructions: `Transfer to the bank account above and upload your transaction receipt as proof.`,
      };
    case "Credit/Debit Card":
      return {
        name: "Credit/Debit Card",
        instructions: HOTEL_CARD_INSTRUCTIONS,
      };
    case "Over-the-Counter":
      return {
        name: "Over-the-Counter",
        instructions: HOTEL_OTC_INSTRUCTIONS,
      };
    default:
      return {
        name: "GCash",
        number: HOTEL_GCASH_NUMBER,
        instructions: `Send payment to the GCash number above and upload your screenshot as proof.`,
      };
  }
}
