/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

import { auth, db } from "@/firebase/firebase.config";
import { doc, onSnapshot } from "firebase/firestore";
import { getCol } from "@/lib/db-utils";
import { createUserProfile, getUserDoc, updateLastLogin, setOnlineStatus } from "@/services/userService";
import { startPresence, stopPresence } from "@/services/presenceService";
import { createSession } from "@/services/sessionService";
import { mapAuthError } from "@/lib/authErrors";
import {
  issueVerificationCode,
  verifyEmailCode,
} from "@/services/emailVerificationService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Seed from auth.currentUser so visitors with a persisted session get the
  // loader (not the login form) on first paint of guarded routes.
  const [user, setUser] = useState(() => auth.currentUser);
  const [role, setRole] = useState(null); // 'guest' | 'fo' | 'admin'
  const [profile, setProfile] = useState(null);
  // Training sandbox is gone: trainingMode stays pinned to false so every
  // existing consumer keeps working until Task 12 removes the threading.
  const [trainingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Transient role to bypass Firestore latency during demo/training setup.
  const assignedRoleRef = useRef(null);
  const currentUidRef = useRef(null);
  const currentSessionIdRef = useRef(null);
  const profileSnapUnsubRef = useRef(null);
  const profileSnapUserRef = useRef(null);

  // Live profile subscription for one user. Extracted so the listener can
  // be repointed without leaving it stuck on a previous user/collection.
  function startProfileSubscription(firebaseUser, mode) {
    if (profileSnapUnsubRef.current) {
      profileSnapUnsubRef.current();
      profileSnapUnsubRef.current = null;
    }
    profileSnapUserRef.current = firebaseUser;
    const ref = doc(db, getCol("users", mode), firebaseUser.uid);
    profileSnapUnsubRef.current = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        // Force-logout enforcement (real-time)
        if (data.forceLogout) {
          const kickedAt = new Date(data.forceLogoutTimestamp || 0).getTime();
          const signedInAt = new Date(
            profileSnapUserRef.current?.metadata?.lastSignInTime || 0
          ).getTime();
          if (signedInAt < kickedAt) {
            if (profileSnapUserRef.current?.isAnonymous) {
              await profileSnapUserRef.current.delete().catch(() => {});
            }
            signOut(auth).catch(() => {});
            return;
          }
        }
        setProfile(data);
        setRole(data.role || "guest");
      },
      () => {}
    );
  }

  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      setAuthError(null);

      // Keep auth across reloads (Phase 1 foundation).
      await setPersistence(auth, browserLocalPersistence);

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (!isMounted) return;
          setUser(firebaseUser);

          if (!firebaseUser) {
            if (currentUidRef.current) {
              setOnlineStatus(currentUidRef.current, false).catch(() => {});
            }
            stopPresence(currentUidRef.current);
            currentUidRef.current = null;
            // Detach the PREVIOUS user's live profile listener. Without this,
            // a later write to the old user's doc (offline flag, presence,
            // session revoke) re-fires here and resurrects their role/profile
            // into the now-signed-out or next session — which made fresh
            // guest accounts briefly inherit staff roles and trip Firestore
            // permission errors on staff-only subscriptions.
            if (profileSnapUnsubRef.current) {
              profileSnapUnsubRef.current();
              profileSnapUnsubRef.current = null;
            }
            profileSnapUserRef.current = null;
            setRole(null);
            setProfile(null);
            setAuthError(null); // clear any stale error from sign-out transition
            assignedRoleRef.current = null;
            setLoading(false);
            return;
          }

          // Guard against the sign-out race: register() creates a user and then
          // immediately signs out. The async handler below keeps running for the
          // just-created user AFTER sign-out, and its Firestore reads/writes then
          // run with request.auth == null -> Phase-4 rules deny them and the error
          // leaks onto the /login form. Bail out if the live session no longer
          // matches the user captured by this callback.
          const stillSignedIn = () => auth.currentUser?.uid === firebaseUser.uid;
          if (!stillSignedIn()) return;

          // Training sandbox is gone: collections are always production.
          const effectiveTrainingMode = false;

          if (!stillSignedIn()) return;

          // Fetch the user doc once for initial role/force-logout, then
          // subscribe to live changes so profile (fullName, photoUrl, phone,
          // emailVerified) propagates instantly across the entire app.
          const userDoc = await getUserDoc(firebaseUser.uid, {
            preferTraining: effectiveTrainingMode,
          });

          if (!stillSignedIn()) return;

            if (userDoc) {
            // Force logout enforcement: if this session was created before the
            // admin's force-logout timestamp, sign the user out.
            if (userDoc.forceLogout) {
              const kickedAt = new Date(userDoc.forceLogoutTimestamp || 0).getTime();
              const signedInAt = new Date(firebaseUser.metadata?.lastSignInTime || 0).getTime();
              if (signedInAt < kickedAt) {
                // Kicked anonymous accounts are purged best-effort.
                if (firebaseUser.isAnonymous) {
                  await firebaseUser.delete().catch(() => {});
                }
                await signOut(auth);
                return;
              }
            }

            setProfile(userDoc);
            setRole(userDoc.role || "guest");

            // Update last login timestamp, set online status, and create session
            try {
              await updateLastLogin(firebaseUser.uid, { trainingMode: effectiveTrainingMode });
              await setOnlineStatus(firebaseUser.uid, true, { trainingMode: effectiveTrainingMode });
              currentUidRef.current = firebaseUser.uid;
              startPresence(firebaseUser.uid, { trainingMode: effectiveTrainingMode });
            } catch (e) {
              console.error("Failed to update last login/online status:", e);
            }

            // Create session for tracking (non-blocking)
            createSession(firebaseUser.uid, { trainingMode: effectiveTrainingMode })
              .then((session) => {
                currentSessionIdRef.current = session.id;
              })
              .catch((e) => {
                console.error("Failed to create session:", e);
              });

            // Live profile subscription: keeps profile in sync when
            // ProfilePage (or other components) update fullName/photoUrl/phone,
            // and enforces force-logout in real time.
            startProfileSubscription(firebaseUser, effectiveTrainingMode);
          } else if (assignedRoleRef.current) {
            setRole(assignedRoleRef.current);
          } else {
            setRole("guest");
          }

          // No profile doc yet (register() is still writing it — the auth
          // callback can win that race). Subscribe anyway so the doc that
          // lands a moment later brings emailVerified/role with it: without
          // this, profile stays null, the verification gate never fires, and
          // the new account is unverified with no way to notice.
          if (!userDoc) startProfileSubscription(firebaseUser, effectiveTrainingMode);

          setLoading(false);
        } catch (e) {
          if (!isMounted) return;
          if (assignedRoleRef.current) {
            setRole(assignedRoleRef.current);
          } else {
            setRole("guest");
          }
          setAuthError(mapAuthError(e) || "Failed to detect user role.");
          setLoading(false);
        }
      });

      // Cleanup
      return () => unsub();
    }

    let cleanup = null;
    init().then((c) => (cleanup = c));

    return () => {
      isMounted = false;
      if (profileSnapUnsubRef.current) {
        profileSnapUnsubRef.current();
        profileSnapUnsubRef.current = null;
      }
      if (cleanup) cleanup();
    };
  }, []);



  // Email verification (OTP) helpers. Defined in the provider body so they see
  // the current trainingMode/profile rather than a stale closure.
  const sendVerificationCode = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) throw new Error("Not signed in.");
    return issueVerificationCode({
      uid: currentUser.uid,
      email: currentUser.email,
      fullName: profile?.fullName || "",
      trainingMode,
    });
  }, [profile, trainingMode]);

  const verifyEmailWithCode = useCallback(
    async (code) => {
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) throw new Error("Not signed in.");
      const result = await verifyEmailCode({
        uid: currentUser.uid,
        code,
        trainingMode,
      });
      if (result.ok) {
        const fresh = await getUserDoc(currentUser.uid, {
          preferTraining: trainingMode,
        });
        if (fresh) setProfile(fresh);
      }
      return result;
    },
    [trainingMode],
  );

  const api = useMemo(() => {
    async function login({ email, password }) {
      setAuthError(null);
      setLoading(true);
      assignedRoleRef.current = null;
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        setAuthError(mapAuthError(e) || "Login failed.");
        setLoading(false);
        throw e;
      }
    }

    async function register({ email, password, fullName = "", phone = "" }) {
      setAuthError(null);
      setLoading(true);
      assignedRoleRef.current = "guest";

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Sandbox is gone: registration is always a production guest signup.
        const effectiveTrainingMode = false;

        await createUserProfile({
          uid: cred.user.uid,
          email: cred.user.email,
          role: "guest",
          fullName,
          phone,
          trainingMode: effectiveTrainingMode,
        });

        // Stay signed in: Firebase already signed the new user in, and the
        // unverified guest can only reach /verify-email, so sending them back
        // to /login to sign in again bought nothing.
      } catch (e) {
        setAuthError(mapAuthError(e) || "Register failed.");
        setLoading(false);
        throw e;
      }
    }

    async function logout() {
      setAuthError(null);
      setLoading(true);
      assignedRoleRef.current = null;
      try {
        const currentUser = auth.currentUser;
        if (currentUser?.uid) {
          // Set offline status before logout
          try {
            stopPresence(currentUser.uid, { trainingMode });
            await setOnlineStatus(currentUser.uid, false, { trainingMode });
            if (currentUidRef.current === currentUser.uid) currentUidRef.current = null;
          } catch (e) {
            console.error("Failed to set offline status:", e);
            // Don't block logout if this fails
          }
        }

        if (currentUser?.isAnonymous) {
          // This also signs the user out automatically.
          await currentUser.delete();
        } else {
          await signOut(auth);
        }
      } catch (e) {
        setAuthError(mapAuthError(e) || "Logout failed.");
        setLoading(false);
        throw e;
      }
    }

    async function forgotPassword({ email }) {
      await sendPasswordResetEmail(auth, email);
    }

      return { login, register, logout, forgotPassword };
  }, [trainingMode]);

  const value = useMemo(
    () => ({
      user,
      role,
      profile,
      trainingMode,
      loading,
      authError,
      sendVerificationCode,
      verifyEmailWithCode,
      ...api,
    }),
    [user, role, trainingMode, loading, authError, profile, api, sendVerificationCode, verifyEmailWithCode]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}


