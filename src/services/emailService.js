import emailjs from '@emailjs/browser';

/**
 * Send booking confirmation email via EmailJS
 * Email failure must NOT block the booking approval flow
 */
export async function sendBookingConfirmation({ toEmail, toName, roomName, checkIn, checkOut, bookingId, paymentType }) {
  try {
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
      console.error('EmailJS: Missing environment variables');
      return;
    }

    const templateParams = {
      to_email: toEmail,
      to_name: toName,
      room_name: roomName,
      check_in: checkIn,
      check_out: checkOut,
      booking_id: bookingId,
      payment_type: paymentType,
    };

    await emailjs.send(serviceId, templateId, templateParams, publicKey);
    console.log('EmailJS: Booking confirmation email sent successfully');
  } catch (error) {
    // Log error but don't throw - email failure should not block booking approval
    console.error('EmailJS: Failed to send booking confirmation email:', error);
  }
}
