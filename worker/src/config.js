// Moved verbatim from src/index.js — shared constants, no logic changes.
export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const MODEL_ID = "openai/gpt-oss-20b";

export const RATE_WINDOW_MS = 60 * 1000;

export const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
export const TOKEN_SKEW_SECONDS = 60;

export const EXPIRY_SWEEP_MAX_PER_COLLECTION = 100;

export const ORPHAN_SWEEP_MAX_DELETES = 200;

// Training zombies: anonymous trainee accounts abandoned via kick, expiry, or
// tab-close never log out, so their training_guests docs pile up. Docs idle
// longer than this get purged by the hourly cron (doc + auth account).
export const STALE_TRAINING_GUEST_MS = 7 * 24 * 60 * 60 * 1000;
export const STALE_TRAINING_GUEST_MAX = 200;
