import { jsPDF } from 'jspdf';
import hotelLogo from '@/assets/Hotellogo.png?inline';

// Restyle: whitespace + single accent #F5C518, flat rows, no filled pills.
// helvetica = built-in sans (no font embed, no package change).

const ACCENT = [245, 197, 24]; // #F5C518 — sole accent
const DARK = [27, 27, 27];
const MUTED = [115, 115, 115];
const LINE = [232, 232, 232];
const GREEN = [22, 163, 74];
const MARGIN = 18;

/**
 * Draws the hotel logo in the header. Best-effort: if the image
 * fails, the text header still stands on its own.
 */
function addHeaderLogo(doc, x, y, size) {
  try {
    if (hotelLogo) doc.addImage(hotelLogo, 'PNG', x, y, size, size);
  } catch {
    // keep the text header
  }
}

function pluralizeNight(n) {
  return `${n} night${Number(n) === 1 ? '' : 's'}`;
}

function formatAmount(num) {
  return `PHP ${Number(num).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

// Document stamp: small-caps status text in gold with a thin gold
// left-border line. No fill, no rounded pill.
function drawHeader(doc, stampText) {
  const pageWidth = doc.internal.pageSize.width;
  const logoSize = 12;
  addHeaderLogo(doc, MARGIN, 12, logoSize);

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('HotelEase', MARGIN + logoSize + 4, 17.5);

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('BSHM Property Management System', MARGIN + logoSize + 4, 22);

  // Stamp, right-aligned.
  const label = String(stampText).toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const stampW = doc.getTextWidth(label);
  const stampX = pageWidth - MARGIN - stampW;
  const stampY = 17.5;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(stampX - 6, stampY - 5, stampX - 6, stampY + 3);
  doc.setTextColor(...ACCENT);
  doc.text(label, stampX, stampY);
}

function drawRule(doc, y) {
  const pageWidth = doc.internal.pageSize.width;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
}

function ensureSpace(doc, y, needed = 20) {
  if (y + needed > 282) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

// Plain label-value rows with hairline dividers. No table header.
function drawKeyValues(doc, rows, startY) {
  const pageWidth = doc.internal.pageSize.width;
  const valueX = pageWidth - MARGIN;
  let y = startY;
  rows.forEach(([label, value]) => {
    y = ensureSpace(doc, y, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(String(label), MARGIN, y);
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(String(value), 110);
    doc.text(lines, valueX, y, { align: 'right' });
    y += 5.5 * lines.length + 2;
    drawRule(doc, y);
    y += 5;
  });
  return y;
}

// Flat charge rows: right-aligned amounts, bold totals, green zero
// balance, single divider above the Total row. No table header.
function drawFlatRows(doc, rows, startY) {
  const pageWidth = doc.internal.pageSize.width;
  const valueX = pageWidth - MARGIN;
  let y = startY;
  rows.forEach(({ label, value, bold = false, green = false, dividerAbove = false }) => {
    y = ensureSpace(doc, y, 14);
    if (dividerAbove) {
      drawRule(doc, y);
      y += 6;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...(green ? GREEN : DARK));
    const labelLines = doc.splitTextToSize(String(label), 110);
    doc.text(labelLines, MARGIN, y);
    const valueLines = doc.splitTextToSize(String(value), 80);
    doc.text(valueLines, valueX, y, { align: 'right' });
    y += 5.5 * Math.max(labelLines.length, valueLines.length) + 2.5;
  });
  return y;
}

function drawSectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(title, MARGIN, y);
  return y + 6;
}

// Payment reference as plain text. No totals repeated here.
function drawPaymentReference(doc, refParts, simulated, startY) {
  let y = ensureSpace(doc, startY, 16);
  const ref = refParts.length > 0 ? refParts.join('  ·  ') : null;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (ref) {
    const lines = doc.splitTextToSize(`Ref ${ref}`, doc.internal.pageSize.width - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    y += 4.5 * lines.length + 1;
  }
  if (simulated) {
    doc.text('Demo payment. No real money moved.', MARGIN, y);
    y += 5;
  }
  return y;
}

/**
 * Generates a professional PDF receipt for HotelEase
 * @param {Object} data - Receipt data
 * @returns {Object} Receipt metadata for Firestore
 */
export const generateReceipt = (data) => {
  const doc = new jsPDF();
  const receiptNo = data.receiptNo || "RCP-" + Date.now();
  const paymentDate = data.paymentDate instanceof Date ? data.paymentDate : new Date(data.paymentDate || Date.now());
  const dateStr = paymentDate.toLocaleDateString();
  const pageWidth = doc.internal.pageSize.width; // 210

  const total = Number(data.total ?? data.subtotal ?? 0);
  const paid = Number(data.amountPaid ?? 0);
  const baseTotal = data.baseTotal ?? (total - (data.extraPaxTotal || 0) - (data.overstayFee || 0));
  const balance = Number(data.balance ?? Math.max(0, total - paid));
  const nights = Number(data.numberOfNights) || 0;
  const rate = Number(data.ratePerNight) || (nights > 0 ? baseTotal / nights : baseTotal);
  const method = data.paymentMethod || 'N/A';
  const roomLabel = data.roomType ? `${data.roomName} (${data.roomType})` : `${data.roomName}`;
  const refParts = [
    data.gatewayRef ? `System ref ${data.gatewayRef}` : null,
    data.bankRef ? `Bank ref ${data.bankRef}` : null,
    data.reference || data.paymentRef || null,
  ].filter(Boolean);

  // --- HEADER (whitespace + gold stamp, no fill) ---
  drawHeader(doc, 'Checked out');

  // --- TITLE ---
  let y = 36;
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const greeting = doc.splitTextToSize(`Thank you for staying with us, ${data.guestName}!`, pageWidth - MARGIN * 2);
  doc.text(greeting, MARGIN, y);
  y += 6 * greeting.length + 2;

  // Receipt No appears once here. No "Processed by" on the guest line.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const meta = doc.splitTextToSize(`Receipt No ${receiptNo} · ${dateStr}`, pageWidth - MARGIN * 2);
  doc.text(meta, MARGIN, y);
  y += 5 * meta.length + 5;

  drawRule(doc, y);
  y += 8;

  // --- STAY (plain rows, hairline dividers) ---
  y = drawSectionTitle(doc, 'Stay', y);
  y = drawKeyValues(doc, [
    ['Room', roomLabel],
    ['Check-in', `${formatDate(data.checkIn)} · 2:00 PM`],
    ['Check-out', `${formatDate(data.checkOut)} · 12:00 NN`],
    ['Duration', pluralizeNight(nights)],
  ], y);
  y += 3;

  // --- CHARGES (flat rows, no header, extras only when > 0) ---
  y = drawSectionTitle(doc, 'Charges', y);
  const extraLabel = data.extraPaxCount > 0 && Number(data.extraPaxFee) > 0
    ? `Extra guests (${data.extraPaxCount} × ${formatAmount(data.extraPaxFee)} / night)`
    : 'Extra guests';
  y = drawFlatRows(doc, [
    { label: `Room charges (${nights} × ${formatAmount(rate)})`, value: formatAmount(baseTotal) },
    ...(Number(data.extraPaxTotal) > 0 ? [{ label: extraLabel, value: formatAmount(data.extraPaxTotal) }] : []),
    ...(Number(data.overstayFee) > 0 ? [{ label: data.overstayReason || 'Late checkout fee', value: formatAmount(data.overstayFee) }] : []),
    { label: 'Total', value: formatAmount(total), bold: true, dividerAbove: true },
    { label: `Paid (${method})`, value: formatAmount(data.amountPaid ?? 0) },
    { label: 'Balance', value: formatAmount(balance), bold: true, green: balance === 0 },
  ], y);
  y += 6;

  // --- PAYMENT REFERENCE (plain text) ---
  if (refParts.length > 0 || data.simulated) {
    y = drawSectionTitle(doc, 'Payment reference', y);
    y = drawPaymentReference(doc, refParts, data.simulated, y);
    y += 2;
  }

  // --- FOOTER ---
  y = ensureSpace(doc, y, 24);
  drawRule(doc, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('We hope to see you again. · Your feedback matters.', pageWidth / 2, y + 6, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const generated = new Date().toLocaleDateString();
  const footerMeta = data.processedBy
    ? `Receipt ${receiptNo} · Generated ${generated} · ${data.processedBy}`
    : `Receipt ${receiptNo} · Generated ${generated}`;
  doc.text(footerMeta, pageWidth / 2, y + 11, { align: 'center' });

  // Save/Download
  doc.save(`HotelEase-Receipt-${receiptNo}.pdf`);

  return {
    receiptNo,
    receiptGeneratedAt: new Date()
  };
};

/**
 * Generates a professional Check-In Slip / Guest Registration PDF for HotelEase.
 * Issued to the guest at the front desk during check-in as a reference for
 * their stay (paid-to-date + balance due). Separate from the check-out receipt.
 *
 * @param {Object} data - Check-in slip data
 * @returns {Object} Slip metadata for Firestore
 */
export const generateCheckInSlip = (data) => {
  const doc = new jsPDF();
  const slipNo = data.slipNo || data.receiptNo || "CIS-" + Date.now();
  const issuedDate = data.issuedDate instanceof Date ? data.issuedDate : new Date(data.issuedDate || Date.now());
  const dateStr = issuedDate.toLocaleDateString();
  const pageWidth = doc.internal.pageSize.width; // 210

  const total = Number(data.total ?? 0);
  const paid = Number(data.amountPaid ?? 0);
  const balance = Number(data.balance ?? Math.max(0, total - paid));
  const nights = Number(data.numberOfNights) || 0;
  const rate = Number(data.ratePerNight) || 0;
  const method = data.paymentMethod || 'N/A';
  const roomLabel = data.roomType ? `${data.roomName} (${data.roomType})` : `${data.roomName}`;
  const refParts = [
    data.gatewayRef ? `System ref ${data.gatewayRef}` : null,
    data.bankRef ? `Bank ref ${data.bankRef}` : null,
    data.reference || data.paymentRef || null,
  ].filter(Boolean);

  // --- HEADER ---
  drawHeader(doc, 'Checked in');

  // --- TITLE ---
  let y = 36;
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const greeting = doc.splitTextToSize(`Welcome, ${data.guestName}!`, pageWidth - MARGIN * 2);
  doc.text(greeting, MARGIN, y);
  y += 6 * greeting.length + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const meta = doc.splitTextToSize(`Slip No ${slipNo} · ${dateStr}`, pageWidth - MARGIN * 2);
  doc.text(meta, MARGIN, y);
  y += 5 * meta.length + 5;

  drawRule(doc, y);
  y += 8;

  // --- STAY (plain rows, hairline dividers) ---
  y = drawSectionTitle(doc, 'Stay', y);
  y = drawKeyValues(doc, [
    ['Room', roomLabel],
    ...(data.roomNumber ? [['Room no.', `${data.roomNumber}`]] : []),
    ['Check-in', `${formatDate(data.checkIn)} · 2:00 PM`],
    ['Check-out', `${formatDate(data.checkOut)} · 12:00 NN`],
    ['Duration', pluralizeNight(nights)],
    ['Guest', `${data.guestEmail || '-'}${data.guestPhone ? `  ·  ${data.guestPhone}` : ''}`],
  ], y);
  y += 3;

  // --- CHARGES (flat rows, no header) ---
  y = drawSectionTitle(doc, 'Charges', y);
  const rows = [];
  if (nights > 0 && rate > 0) {
    rows.push({ label: `Room charges (${nights} × ${formatAmount(rate)})`, value: formatAmount(nights * rate) });
  }
  if (Number(data.extraPaxTotal) > 0) {
    rows.push({ label: 'Extra guests', value: formatAmount(data.extraPaxTotal) });
  }
  rows.push({ label: 'Total', value: formatAmount(total), bold: true, dividerAbove: rows.length > 0 });
  rows.push({ label: `Paid (${method})`, value: formatAmount(paid) });
  rows.push({ label: 'Balance', value: formatAmount(balance), bold: true, green: balance === 0 });
  y = drawFlatRows(doc, rows, y);
  y += 6;

  // --- PAYMENT REFERENCE (plain text) ---
  if (refParts.length > 0 || data.simulated) {
    y = drawSectionTitle(doc, 'Payment reference', y);
    y = drawPaymentReference(doc, refParts, data.simulated, y);
    y += 2;
  }

  // --- FOOTER ---
  y = ensureSpace(doc, y, 24);
  drawRule(doc, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('Please show this slip at checkout.', pageWidth / 2, y + 6, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const generated = new Date().toLocaleDateString();
  const footerMeta = data.processedBy
    ? `Slip ${slipNo} · Generated ${generated} · ${data.processedBy}`
    : `Slip ${slipNo} · Generated ${generated} · Check-in slip only, not an official receipt.`;
  doc.text(footerMeta, pageWidth / 2, y + 11, { align: 'center' });

  // Save/Download
  doc.save(`HotelEase-CheckInSlip-${slipNo}.pdf`);

  return {
    slipNo,
    issuedAt: new Date()
  };
};
