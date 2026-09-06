// Shared HTML builders for the generic EmailJS template (template_mt0d9ao).
// The Contact template was converted so ~all of its middle section is a single
// {{bodyHTML}} slot. Each sender fills in different HTML for the same shell.

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function buildOtpBlock(otp) {
  const code = escapeHtml(otp);
  return `<td style="background-color:#F5F9FE;border-left:4px solid #3B82F6;padding:16px;border-radius:0 8px 8px 0;">
    <p style="margin:0 0 6px;color:#3B82F6;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;font-family:'Inter',system-ui,sans-serif;">Your Verification Code</p>
    <p style="margin:0;color:#1C1C1E;font-size:30px;font-weight:700;letter-spacing:6px;font-family:'Courier New',monospace;">${code}</p>
    <p style="margin:8px 0 0;color:#6B7280;font-size:12px;font-family:'Inter',system-ui,sans-serif;">Enter this code on the HotelEase site to verify your account. It expires in 10 minutes.</p>
  </td>`;
}

export function buildOtpBody(otp) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
    <tr>${buildOtpBlock(otp)}</tr>
  </table>`;
}

export function buildReplyBody(subject, replyMessage) {
  const subj = escapeHtml(subject);
  const msg = escapeHtml(replyMessage);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
    <tr>
      <td style="background-color:#FAFAF8;border-left:4px solid #F5C518;padding:12px 16px;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#6B7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Regarding</p>
        <p style="margin:4px 0 0;color:#1C1C1E;font-size:14px;font-weight:600;">${subj}</p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#F5F9FE;border-left:4px solid #3B82F6;padding:16px;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 6px;color:#3B82F6;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Our Reply</p>
        <p style="margin:0;color:#1C1C1E;font-size:14px;line-height:1.7;white-space:pre-wrap;">${msg}</p>
      </td>
    </tr>
  </table>`;
}

export function buildBookingBody({ roomName, checkIn, checkOut, bookingId, paymentType }) {
  const room = escapeHtml(roomName);
  const from = escapeHtml(checkIn);
  const to = escapeHtml(checkOut);
  const id = escapeHtml(bookingId);
  const pay = escapeHtml(paymentType);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF8;border:1px solid #E6E6E1;border-left:4px solid #F5C518;padding:20px;border-radius:0 8px 8px 0;">
    <tr><td style="padding:2px 0;color:#6B7280;font-size:13px;">Room</td><td style="padding:2px 0;text-align:right;color:#1C1C1E;font-size:14px;font-weight:600;">${room}</td></tr>
    <tr><td style="padding:2px 0;color:#6B7280;font-size:13px;">Check-in</td><td style="padding:2px 0;text-align:right;color:#1C1C1E;font-size:14px;">${from}</td></tr>
    <tr><td style="padding:2px 0;color:#6B7280;font-size:13px;">Check-out</td><td style="padding:2px 0;text-align:right;color:#1C1C1E;font-size:14px;">${to}</td></tr>
    <tr><td style="padding:2px 0;color:#6B7280;font-size:13px;">Booking ID</td><td style="padding:2px 0;text-align:right;color:#1C1C1E;font-size:14px;font-weight:600;">${id}</td></tr>
    <tr><td style="padding:2px 0;color:#6B7280;font-size:13px;">Payment</td><td style="padding:2px 0;text-align:right;color:#1C1C1E;font-size:14px;">${pay}</td></tr>
  </table>`;
}