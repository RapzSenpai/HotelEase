import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { markAsRead, subscribeToNotifications } from "@/services/notificationService";

/**
 * Types that deserve an immediate toast. Everything else still lands in the
 * bell — the noise policy is data, not code.
 *
 * Skipped on purpose: turnover "room_dirty" chatter, announcements and
 * stay_extended (the FO is standing next to the guest when it happens).
 * Mid-stay requests ring on both sides via "midstay_requested" (FO) and
 * "housekeeping_in_progress" (guest).
 */
export const TOASTABLE_TYPES = new Set([
  "booking_request",
  "booking_approved",
  "booking_rejected",
  "booking_cancelled",
  "cancellation_requested",
  "cancellation_approved",
  "cancellation_rejected",
  "refund_requested",
  "refund_approved",
  "refund_paid",
  "refund_rejected",
  "payment_proof_required",
  "payment_proof_uploaded",
  "payment_received",
  "support_message",
  "midstay_requested",
  "housekeeping_in_progress",
]);

export function shouldToast(type) {
  return typeof type === "string" && type !== "" && TOASTABLE_TYPES.has(type);
}

/**
 * Global bridge from the notification inbox to sonner: any new notification
 * that passes the policy above pops a toast with a View action. The inbox is
 * the event bus, so every current and future notification type is covered
 * without per-page diffing.
 *
 * Mounted where the bell is (global for signed-in users). The first snapshot
 * seeds silently, so login/refresh never replays history as a toast storm.
 *
 * ponytail: the inbox subscription is the padded window (newest 20). A much
 * older notification that re-enters that window (newer rows deleted) would be
 * treated as new and toasted; the ceiling is 20 unread rows, and the upgrade
 * path is a createdAt watermark instead of an id set.
 */
export function useNotificationToasts({ userId, trainingMode = null } = {}) {
  const navigate = useNavigate();
  const seenRef = useRef({ seeded: false, ids: new Set() });

  useEffect(() => {
    // A different user (or sandbox mode) is a different inbox — reseed.
    seenRef.current = { seeded: false, ids: new Set() };
    if (!userId) return undefined;

    const unsub = subscribeToNotifications(userId, (list) => {
      const seen = seenRef.current;
      if (!seen.seeded) {
        for (const notif of list) seen.ids.add(notif.id);
        seen.seeded = true;
        return;
      }

      const fresh = [];
      for (const notif of list) {
        if (seen.ids.has(notif.id)) continue;
        seen.ids.add(notif.id);
        fresh.push(notif);
      }
      if (fresh.length === 0) return;

      // Oldest first so the newest toast ends up on top of the stack.
      for (const notif of fresh.reverse()) {
        if (!shouldToast(notif.type)) continue;
        const toastId = toast.message(notif.title, {
          description: notif.message,
          duration: 10000,
          action: notif.link
            ? {
                label: "View",
                onClick: () => {
                  toast.dismiss(toastId);
                  // Clicking the toast counts as reading it (same rule as the bell).
                  markAsRead(userId, notif.id, { trainingMode }).catch(() => {});
                  navigate(notif.link);
                },
              }
            : undefined,
        });
      }
    }, { trainingMode });

    return () => unsub();
  }, [userId, trainingMode, navigate]);
}
