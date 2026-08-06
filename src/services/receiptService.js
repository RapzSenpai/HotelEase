import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const contentWidth = pageWidth - (margin * 2); // 180

  const formatAmount = (num) => 
    `Php ${Number(num).toLocaleString('en-PH', {
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

  // "HotelEase" logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkTextColor);
  doc.text("HotelEase", margin, 15);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("BSHM Property Management System", margin, 21);

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
  doc.text("Bill To:", margin, 58);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${data.guestName}`, margin, 63);
  doc.text(`Email: ${data.guestEmail}`, margin, 68);
  doc.text(`Processed By: ${data.processedBy}`, margin, 73);

  const baseTotal = data.baseTotal ?? ((data.total ?? data.subtotal) - (data.extraPaxTotal || 0));
  const hasExtraPax = data.extraPaxTotal > 0;

  // --- STAY DETAILS TABLE ---
  autoTable(doc, {
    startY: 78,
    margin: { left: margin, right: margin },
    head: [['Description', 'Details']],
    body: [
      ['Room', `${data.roomName} (${data.roomType})`],
      ['Check-in', `${new Date(data.checkIn).toLocaleDateString()} at 2:00 PM`],
      ['Check-out', `${new Date(data.checkOut).toLocaleDateString()} at 12:00 NN`],
      ['Duration', `${data.numberOfNights} night(s)`],
      ['Base Rate per Night', formatAmount(data.ratePerNight)],
      ...(hasExtraPax ? [['Extra Guest Policy', `${data.extraPaxCount} extra guest(s) @ ${formatAmount(data.extraPaxFee)}/night`]] : []),
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
    head: [['Summary Item', 'Amount']],
    body: [
      ['Base Room Charges', formatAmount(baseTotal)],
      ...(hasExtraPax ? [['Extra Guest Surcharge', formatAmount(data.extraPaxTotal)]] : []),
      ['Total Amount', formatAmount(data.total ?? data.subtotal)],
      ['Amount Paid', formatAmount(data.amountPaid)],
      ['Balance Due', formatAmount(data.balance)],
      ['Payment Method', `${data.paymentMethod || 'N/A'}`],
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
  doc.text("Thank you for choosing HotelEase!", pageWidth / 2, footerY + 6, { align: "center" });
  doc.setFontSize(7.5);
  doc.text("This is a system-generated receipt.", pageWidth / 2, footerY + 10, { align: "center" });

  // Save/Download
  doc.save(`HotelEase-Receipt-${receiptNo}.pdf`);

  return {
    receiptNo,
    receiptGeneratedAt: new Date()
  };
};

