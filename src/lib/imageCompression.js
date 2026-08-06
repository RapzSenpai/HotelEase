import imageCompression from "browser-image-compression";

const COMPRESSION_OPTIONS = {
  avatar: {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 512,
    useWebWorker: true,
    initialQuality: 0.85,
  },
  roomPhotos: {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    initialQuality: 0.82,
  },
  announcementImages: {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    initialQuality: 0.8,
  },
  paymentProofs: {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    initialQuality: 0.75,
  },
};

/**
 * Compress an image file before upload.
 * @param {File} file
 * @param {"avatar" | "roomPhotos" | "announcementImages" | "paymentProofs"} preset
 * @returns {Promise<File>} compressed file (or original if already small enough)
 */
export async function compressImage(file, preset = "roomPhotos") {
  if (!file.type.startsWith("image/")) return file;

  const opts = COMPRESSION_OPTIONS[preset] || COMPRESSION_OPTIONS.roomPhotos;

  // Skip compression if file is already small enough
  if (file.size <= opts.maxSizeMB * 1024 * 1024 * 0.5) return file;

  try {
    const compressed = await imageCompression(file, opts);
    return compressed;
  } catch {
    return file;
  }
}
