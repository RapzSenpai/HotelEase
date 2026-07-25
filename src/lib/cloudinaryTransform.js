/**
 * Cloudinary URL transformation helpers.
 * Appends query params to Cloudinary URLs for on-the-fly optimization.
 * Only transforms Cloudinary URLs — returns original URL for non-Cloudinary sources.
 */

const isCloudinaryUrl = (url) =>
  typeof url === "string" && url.includes("cloudinary.com/");

/**
 * Get an optimized version of a Cloudinary image URL.
 * @param {string} url - original Cloudinary URL
 * @param {{ width?: number, quality?: number, format?: "auto" | "webp" | "avif" }} opts
 * @returns {string}
 */
export function optimizeCloudinaryUrl(url, { width, quality = "auto", format = "auto" } = {}) {
  if (!isCloudinaryUrl(url)) return url;

  const params = [];
  if (width) params.push(`w_${width}`);
  params.push(`q_${quality}`);
  params.push(`f_${format}`);
  params.push("c_limit");

  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${params.join(",")}`;
}

/**
 * Generate srcSet for responsive Cloudinary images.
 * @param {string} url
 * @param {number[]} widths - e.g. [400, 800, 1200]
 * @returns {string} srcSet attribute value
 */
export function cloudinarySrcSet(url, widths = [400, 800, 1200]) {
  if (!isCloudinaryUrl(url)) return undefined;
  return widths.map((w) => `${optimizeCloudinaryUrl(url, { width: w })} ${w}w`).join(", ");
}
