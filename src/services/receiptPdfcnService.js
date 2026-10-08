import { createElement } from "react";
import {
  HotelReceiptDocument,
  hotelReceiptDataFromFolio,
} from "@/components/pdf/HotelReceiptDocument";

export { HotelReceiptPreview } from "@/components/pdf/HotelReceiptDocument";
export { hotelReceiptDataFromFolio };

/**
 * Renders the pdfcn hotel receipt with takumi-pdf and downloads it.
 * Throws with a clear message when the WASM/browser render is unavailable
 * so the caller can fall back to the classic jsPDF receipt.
 */
export const downloadHotelReceiptPdfcn = async (folio = {}) => {
  const data = hotelReceiptDataFromFolio(folio);
  let pdfBytes;
  try {
    const { render } = await import("takumi-pdf");
    pdfBytes = await render(
      createElement(HotelReceiptDocument, { data }),
      { size: "a4" },
    );
  } catch (err) {
    throw new Error(
      `pdfcn render failed (${err?.message || err}); falling back to classic receipt.`,
    );
  }
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  // Copy into a plain ArrayBuffer so BlobPart typing stays happy.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `HotelEase-Receipt-${data.receiptNo}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { receiptNo: data.receiptNo };
};
