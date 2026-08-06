import { getAnalytics, logEvent, isSupported } from "firebase/analytics";
import app from "@/firebase/firebase.config";

/**
 * GA4 event-name constants used across the app.
 * (Firestore keeps business records; GA4 tracks behavior/funnels.)
 */
export const GA_EVENTS = {
  PAGE_VIEW: "page_view",
  ROOM_VIEW: "view_room",
  BOOKING_CREATED: "booking_created",
  BOOKING_CANCELLED: "booking_cancelled",
  CHECK_IN: "check_in",
  CHECK_OUT: "check_out",
  PAYMENT_SUCCESS: "payment_success",
  PAYMENT_FAILED: "payment_failed",
  LOGIN: "login",
  SIGNUP: "signup",
};

let analytics = null;
let analyticsReady = null;

/**
 * Lazily initialize GA4. Safe everywhere — returns null in environments
 * where Analytics is unsupported or not configured.
 * @returns {Promise<import("firebase/analytics").Analytics|null>}
 */
async function getAnalyticsInstance() {
  if (!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null;
  if (analytics) return analytics;
  if (analyticsReady) return analyticsReady;

  analyticsReady = Promise.resolve()
    .then(() => isSupported())
    .then((supported) => {
      if (!supported) return null;
      analytics = getAnalytics(app);
      return analytics;
    })
    .catch(() => null);

  analyticsReady = analyticsReady.then((analyticsInstance) => {
    analytics = analyticsInstance;
    return analyticsInstance;
  });

  return analyticsReady;
}

/**
 * Fire a GA4 event. No-op if analytics is unavailable/unsupported.
 * @param {string} eventName - Use GA_EVENTS constants where possible
 * @param {Object} [params] - Standard or custom event parameters
 * @returns {Promise<void>}
 */
export async function trackEvent(eventName, params = {}) {
  const instance = await getAnalyticsInstance();
  if (!instance) return;
  try {
    logEvent(instance, eventName, params);
  } catch (e) {
    console.warn("GA event skipped:", eventName, e);
  }
}

/**
 * Convenience wrapper to send a page_view for a route + page title.
 * @param {string} pageLocation
 * @param {string} [pageTitle]
 */
export function trackPageView(pageLocation, pageTitle = "") {
  trackEvent(GA_EVENTS.PAGE_VIEW, {
    page_location: pageLocation,
    page_title: pageTitle,
    page_path: pageLocation,
  });
}