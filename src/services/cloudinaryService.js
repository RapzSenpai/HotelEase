/**
 * Cloudinary image upload service.
 * Uses unsigned upload with a configured upload preset — no API secret required on the client.
 *
 * IMPORTANT (unsigned presets are public): lock down the upload preset in the
 * Cloudinary dashboard (Settings → Upload → your preset):
 *   - Signing Mode: unsigned (unchanged)
 *   - File type restriction: Image only
 *   - Max file size: ~5 MB
 *   - Allowed formats: jpg, png, webp
 *   - Optional: enable moderation to block inappropriate uploads
 * These restrictions prevent strangers who extract the preset from your JS
 * bundle from uploading arbitrary files to this Cloudinary account.
 */

import { compressImage } from "@/lib/imageCompression";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// Shared abuse gate: EVERY uploader (room photos, avatars, proof, housekeeping,
// announcements) routes through here, so one check covers all callers. Matches
// the preset limits documented above — the dashboard stays the real enforcer
// for attackers calling Cloudinary directly.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Upload a single File object to Cloudinary.
 * Training uploads are tagged "training" so they stay filterable apart
 * from production files. (Full quota isolation needs a separate upload
 * preset in the Cloudinary dashboard — tags are the most unsigned
 * uploads can enforce client-side.)
 * @param {File} file
 * @param {{ onProgress?: (pct: number) => void, compressionPreset?: string, trainingMode?: boolean | null }} options
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadImageToCloudinary(file, { onProgress, compressionPreset = "roomPhotos", trainingMode = null } = {}) {
  if (!file || typeof file.type !== "string" || !file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
  file = await compressImage(file, compressionPreset);
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Ensure VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET are set in .env"
    );
  }

  // Resolve like getCol: explicit param wins, else production (the training
  // sandbox is gone, so uploads are always tagged prod).
  let isTraining = trainingMode === true || trainingMode === "training";
  if (trainingMode === null || trainingMode === undefined) {
    isTraining = false;
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("tags", isTraining ? "training" : "prod");
    // Note: folder parameter removed since preset has 'use asset folder as public id prefix: false'

    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, publicId: data.public_id });
        } catch {
          reject(new Error("Invalid response from Cloudinary."));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err?.error?.message || `Upload failed: HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload was aborted.")));

    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.send(formData);
  });
}
