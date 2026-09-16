/**
 * Shared display formatters.
 *
 * These were copy-pasted into ~12 pages before; the two shapes below are the
 * only ones that were genuinely identical. Pages that format differently on
 * purpose (e.g. the landing page's long "en-PH" dates, the analytics plain
 * currency) keep their own local helper.
 */

/** YYYY-MM-DD for a Firestore Timestamp / Date / date string, else "—". */
export function formatDate(dateLike) {
  if (dateLike == null) return "—";
  const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(d?.getTime?.() ?? NaN)) return "—";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Local date + time (toLocaleString) for a Timestamp/Date, else "—". */
export function formatDateTime(dateLike) {
  if (dateLike == null) return "—";
  const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(d?.getTime?.() ?? NaN)) return "—";
  return d.toLocaleString();
}

/** "PHP 1,234.00" for a numeric amount, else "—". */
export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return `PHP ${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
