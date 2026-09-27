import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import hotelLogo from '@/assets/Hotellogo.png?inline';

/**
 * Draws the hotel logo in the header bar. Best-effort: if the image
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
  const margin = 15;

  const formatAmount = (num) =>
    `PHP ${Number(num).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`

  // Colors
  const primaryColor = [245, 197, 24]; // #F5C518
  const darkTextColor = [33, 33, 33];
  const lightTextColor = [100, 100, 100];
  const separatorColor = [200, 200, 200];

  // --- HEADER ---
  // Background bar
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Logo right, "HotelEase" name left — keeps the header airy
  const logoSize = 14;
  addHeaderLogo(doc, pageWidth - margin - logoSize, 6, logoSize);
  const textX = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkTextColor);
  doc.text("HotelEase", textX, 15);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("BSHM Property Management System", textX, 21);

  // --- OFFICIAL RECEIPT TITLE ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const title = "OFFICIAL RECEIPT";
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, 36);

  // Receipt No and Date (Right Aligned)
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...lightTextColor);
  doc.text(`Receipt No: ${receiptNo}`, pageWidth - margin, 42, { align: 'right' });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, 47, { align: 'right' });

  // Separator Line
  doc.setDrawColor(...separatorColor);
  doc.setLineWidth(0.2);
  doc.line(margin, 51, pageWidth - margin, 51);

  // --- GUEST INFO ---
  doc.setTextColor(...darkTextColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Guest:", margin, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${data.guestName}`, margin, 63);
  doc.text(`Email: ${data.guestEmail}`, margin, 68);
  doc.text(`Assisted by: ${data.processedBy}`, margin, 73);

  const baseTotal = data.baseTotal ?? ((data.total ?? data.subtotal) - (data.extraPaxTotal || 0) - (data.overstayFee || 0));
  const hasExtraPax = data.extraPaxTotal > 0;
  const roomLabel = data.roomType ? `${data.roomName} (${data.roomType})` : `${data.roomName}`;
  // Each reference keeps its source label so a system ref can never read
  // as belonging to the guest's payment method row or vice versa.
  const refParts = [
    data.gatewayRef ? `System ref ${data.gatewayRef}` : null,
    data.bankRef ? `Bank ref ${data.bankRef}` : null,
    data.reference || null,
  ].filter(Boolean);

  // --- STAY DETAILS TABLE ---
  autoTable(doc, {
    startY: 78,
    margin: { left: margin, right: margin },
    head: [['Description', 'Details']],
    body: [
      ['Room', roomLabel],
      ['Check-in', `${new Date(data.checkIn).toLocaleDateString()} at 2:00 PM`],
      ['Check-out', `${new Date(data.checkOut).toLocaleDateString()} at 12:00 NN`],
      ['Duration', pluralizeNight(data.numberOfNights)],
      ['Rate per night', formatAmount(data.ratePerNight)],
      ...(hasExtraPax ? [[`Extra guests (${data.extraPaxCount} x ${formatAmount(data.extraPaxFee)}/night)`, formatAmount(data.extraPaxTotal)]] : []),
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: darkTextColor, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  // --- PAYMENT SUMMARY TABLE ---
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: margin, right: margin },
    head: [['Charge', 'Amount']],
    body: [
      ['Room charges', formatAmount(baseTotal)],
      ...(hasExtraPax ? [['Extra guests', formatAmount(data.extraPaxTotal)]] : []),
      ...(data.overstayFee > 0 ? [[data.overstayReason || 'Late checkout fee', formatAmount(data.overstayFee)]] : []),
      ['Total', formatAmount(data.total ?? data.subtotal)],
      ['Paid', formatAmount(data.amountPaid)],
      ['Balance', formatAmount(data.balance)],
      ['Payment method', `${data.paymentMethod || 'N/A'}${data.simulated ? ' (demo)' : ''}`],
      ...(refParts.length > 0 ? [['Reference', refParts.join(' / ')]] : []),
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: darkTextColor, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 130 }, 
      1: { cellWidth: 50, halign: 'right' } 
    }
  });

  // --- FOOTER ---
  const finalY = doc.lastAutoTable.finalY;
  const footerY = finalY + 12;
  
  doc.setDrawColor(...separatorColor);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  
  doc.setFontSize(8.5);
  doc.setTextColor(...lightTextColor);
  doc.text("Thanks for staying with us.", pageWidth / 2, footerY + 6, { align: "center" });
  doc.setFontSize(7.5);
  doc.text("This receipt was generated by the system.", pageWidth / 2, footerY + 10, { align: "center" });
  if (data.simulated) {
    doc.text("Demo payment. No real money moved.", pageWidth / 2, footerY + 14, { align: "center" });
  }

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
  const margin = 15;

  const formatAmount = (num) =>
    `PHP ${Number(num).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`

  // Colors
  const primaryColor = [245, 197, 24]; // #F5C518
  const darkTextColor = [33, 33, 33];
  const lightTextColor = [100, 100, 100];
  const separatorColor = [200, 200, 200];

  // --- HEADER ---
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 26, 'F');

  const slipLogoSize = 14;
  addHeaderLogo(doc, pageWidth - margin - slipLogoSize, 6, slipLogoSize);
  const slipTextX = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkTextColor);
  doc.text("HotelEase", slipTextX, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("BSHM Property Management System", slipTextX, 21);

  // --- CHECK-IN SLIP TITLE ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const title = "CHECK-IN SLIP";
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, 36);

  // Slip No and Date (Right Aligned)
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...lightTextColor);
  doc.text(`Slip No: ${slipNo}`, pageWidth - margin, 42, { align: 'right' });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, 47, { align: 'right' });

  // Separator Line
  doc.setDrawColor(...separatorColor);
  doc.setLineWidth(0.2);
  doc.line(margin, 51, pageWidth - margin, 51);

  // --- GUEST INFO ---
  doc.setTextColor(...darkTextColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Guest:", margin, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${data.guestName}`, margin, 63);
  doc.text(`Email: ${data.guestEmail}`, margin, 68);
  doc.text(`Phone: ${data.guestPhone || "-"}`, margin, 73);
  doc.text(`Front desk: ${data.processedBy}`, margin, 78);

  // --- STAY DETAILS TABLE ---
  let startY = data.guestPhone ? 86 : 83;
  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    head: [['Description', 'Details']],
    body: [
      ['Room', data.roomType ? `${data.roomName} (${data.roomType})` : `${data.roomName}`],
      ['Room no.', `${data.roomNumber || "-"}`],
      ['Check-in', `${new Date(data.checkIn).toLocaleDateString()} at 2:00 PM`],
      ['Check-out', `${new Date(data.checkOut).toLocaleDateString()} at 12:00 NN`],
      ['Duration', pluralizeNight(data.numberOfNights)],
      ['Rate per night', formatAmount(data.ratePerNight)],
      ...(data.extraPaxTotal > 0 ? [['Extra guests', formatAmount(data.extraPaxTotal)]] : []),
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: darkTextColor, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 130 }
    }
  });

  // --- PAYMENT POSITION TABLE ---
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: margin, right: margin },
    head: [['Payment', 'Amount']],
    body: [
      ['Total', formatAmount(data.total)],
      ['Paid', formatAmount(data.amountPaid)],
      ['Balance', formatAmount(data.balance)],
      ['Payment method', `${data.paymentMethod || 'N/A'}${data.simulated ? ' (demo)' : ''}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: darkTextColor, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right' }
    }
  });

  // --- FOOTER ---
  const finalY = doc.lastAutoTable.finalY;
  const footerY = finalY + 12;

  doc.setDrawColor(...separatorColor);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFontSize(8.5);
  doc.setTextColor(...lightTextColor);
  doc.text("Please show this slip at checkout.", pageWidth / 2, footerY + 6, { align: "center" });
  doc.setFontSize(7.5);
  doc.text("Check-in slip only, not an official receipt.", pageWidth / 2, footerY + 10, { align: "center" });

  // Save/Download
  doc.save(`HotelEase-CheckInSlip-${slipNo}.pdf`);

  return {
    slipNo,
    issuedAt: new Date()
  };
};

