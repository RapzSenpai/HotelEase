import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const HEARTBEAT_INTERVAL_MS = 20000;
export const ONLINE_WINDOW_MS = 60000;

const sessions = new Map();

function writeHeartbeat(uid, trainingMode) {
  return updateDoc(doc(db, getCol("users", trainingMode), uid), {
    lastSeenAt: serverTimestamp(),
  });
}

export function startPresence(uid, { trainingMode = false } = {}) {
  if (!uid || typeof window === "undefined") return;
  stopPresence(uid);

  writeHeartbeat(uid, trainingMode).catch(() => {});

  const interval = setInterval(() => {
    writeHeartbeat(uid, trainingMode).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  const handleExit = () => {
    writeHeartbeat(uid, trainingMode).catch(() => {});
  };

  window.addEventListener("beforeunload", handleExit);
  window.addEventListener("pagehide", handleExit);
  document.addEventListener("visibilitychange", handleExit);

  sessions.set(uid, {
    cleanup: () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleExit);
      window.removeEventListener("pagehide", handleExit);
      document.removeEventListener("visibilitychange", handleExit);
    },
  });
}

export function stopPresence(uid, { trainingMode = false } = {}) {
  const session = sessions.get(uid);
  if (session) {
    session.cleanup();
    sessions.delete(uid);
  }
  if (uid) writeHeartbeat(uid, trainingMode).catch(() => {});
}

export function isOnlineNow(userData) {
  if (!userData || userData.isOnline !== true) return false;
  if (!userData.lastSeenAt) return false;

  const lastSeen =
    typeof userData.lastSeenAt?.toDate === "function"
      ? userData.lastSeenAt.toDate()
      : new Date(userData.lastSeenAt);

  if (isNaN(lastSeen.getTime())) return false;
  return Date.now() - lastSeen.getTime() <= ONLINE_WINDOW_MS;
}
