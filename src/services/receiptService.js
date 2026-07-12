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
  doc.rect(0, 0, pageWidth, 32, 'F');

  // "HotelEase" logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...darkTextColor);
  doc.text("HotelEase", margin, 18);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("BSHM Property Management System", margin, 25);

  // --- OFFICIAL RECEIPT TITLE ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const title = "OFFICIAL RECEIPT";
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, 45);

  // Receipt No and Date (Right Aligned)
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...lightTextColor);
  doc.text(`Receipt No: ${receiptNo}`, pageWidth - margin, 53, { align: 'right' });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, 58, { align: 'right' });

  // Separator Line
  doc.setDrawColor(...separatorColor);
  doc.setLineWidth(0.2);
  doc.line(margin, 63, pageWidth - margin, 63);

  // --- GUEST INFO ---
  doc.setTextColor(...darkTextColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Bill To:", margin, 72);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Name: ${data.guestName}`, margin, 78);
  doc.text(`Email: ${data.guestEmail}`, margin, 83);
  doc.text(`Processed By: ${data.processedBy}`, margin, 88);

  // --- STAY DETAILS TABLE ---
  autoTable(doc, {
    startY: 95,
    margin: { left: margin, right: margin },
    head: [['Description', 'Details']],
    body: [
      ['Room', `${data.roomName} (${data.roomType})`],
      ['Check-in', `${new Date(data.checkIn).toLocaleDateString()} at 2:00 PM`],
      ['Check-out', `${new Date(data.checkOut).toLocaleDateString()} at 12:00 NN`],
      ['Duration', `${data.numberOfNights} night(s)`],
      ['Rate per Night', formatAmount(data.ratePerNight)],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: darkTextColor, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 50 }, 
      1: { cellWidth: 130 } 
    }
  });

  // --- PAYMENT SUMMARY TABLE ---
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    margin: { left: margin, right: margin },
    head: [['Summary', 'Amount']],
    body: [
      ['Subtotal', formatAmount(data.subtotal)],
      ['Amount Paid', formatAmount(data.amountPaid)],
      ['Balance', formatAmount(data.balance)],
      ['Payment Method', `${data.paymentMethod || 'N/A'}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: darkTextColor, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 130 }, 
      1: { cellWidth: 50, halign: 'right' } 
    }
  });

  // --- FOOTER ---
  const finalY = doc.lastAutoTable.finalY;
  const pageHeight = doc.internal.pageSize.height;
  const footerY = Math.max(finalY + 20, pageHeight - 35);
  
  doc.setDrawColor(...separatorColor);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  
  doc.setFontSize(9);
  doc.setTextColor(...lightTextColor);
  doc.text("Thank you for choosing HotelEase!", pageWidth / 2, footerY + 8, { align: "center" });
  doc.setFontSize(8);
  doc.text("This is a system-generated receipt.", pageWidth / 2, footerY + 13, { align: "center" });

  // Save/Download
  doc.save(`HotelEase-Receipt-${receiptNo}.pdf`);

  return {
    receiptNo,
    receiptGeneratedAt: new Date()
  };
};

