/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInAnonymously,
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
import {
  getTrainingSystemState,
  validateTrainingSessionCode,
} from "@/services/trainingService";
import { mapAuthError } from "@/lib/authErrors";
import {
  issueVerificationCode,
  verifyEmailCode,
} from "@/services/emailVerificationService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'guest' | 'fo' | 'admin'
  const [profile, setProfile] = useState(null);
  const [trainingMode, setTrainingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Transient role to bypass Firestore latency during demo/training setup.
  const assignedRoleRef = useRef(null);
  const currentUidRef = useRef(null);
  const currentSessionIdRef = useRef(null);

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
            setRole(null);
            setProfile(null);
            setTrainingMode(false);
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

          const TRAINING_OVERRIDE_KEY = "bshm_training_override";

          let effectiveTrainingMode = (() => {
            try {
              return localStorage.getItem(TRAINING_OVERRIDE_KEY) === "true";
            } catch {
              return false;
            }
          })();

          if (!effectiveTrainingMode) {
            const sys = await getTrainingSystemState();
            effectiveTrainingMode = Boolean(sys.enabled);
          }

          setTrainingMode(effectiveTrainingMode);

          if (!stillSignedIn()) return;

          const userDoc = await getUserDoc(firebaseUser.uid, {
            preferTraining: effectiveTrainingMode,
          });

          if (!stillSignedIn()) return;

          if (userDoc) {
            // Force logout enforcement: if this session was created before the
            // admin's force-logout timestamp, sign the user out. A fresh login
            // after the kick is allowed (its lastSignInTime is newer).
            if (userDoc.forceLogout) {
              const kickedAt = new Date(userDoc.forceLogoutTimestamp || 0).getTime();
              const signedInAt = new Date(firebaseUser.metadata?.lastSignInTime || 0).getTime();
              if (signedInAt < kickedAt) {
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
              // Don't block login if this fails
            }

            // Create session for tracking (non-blocking)
            createSession(firebaseUser.uid, { trainingMode: effectiveTrainingMode })
              .then((session) => {
                currentSessionIdRef.current = session.id;
              })
              .catch((e) => {
                console.error("Failed to create session:", e);
              });
          } else if (assignedRoleRef.current) {
            setRole(assignedRoleRef.current);
          } else {
            setRole("guest");
          }

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
      if (cleanup) cleanup();
    };
  }, []);

  // Real-time force-logout enforcement while the user is active.
  // Fires immediately when an admin force-logs this user out mid-session.
  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, getCol("users", trainingMode), user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.forceLogout) {
          const kickedAt = new Date(data.forceLogoutTimestamp || 0).getTime();
          const signedInAt = new Date(user.metadata?.lastSignInTime || 0).getTime();
          if (signedInAt < kickedAt) {
            signOut(auth).catch(() => {});
          }
        }
      },
      () => {}
    );
    return unsub;
  }, [user?.uid, user?.metadata?.lastSignInTime, trainingMode]);

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
        const effectiveTrainingMode = (() => {
          try {
            return localStorage.getItem("bshm_training_override") === "true";
          } catch {
            return false;
          }
        })();

        await createUserProfile({
          uid: cred.user.uid,
          email: cred.user.email,
          role: "guest",
          fullName,
          phone,
          trainingMode: effectiveTrainingMode,
        });

        // Sign out so user must log in with their new account
        await signOut(auth);
      } catch (e) {
        setAuthError(mapAuthError(e) || "Register failed.");
        setLoading(false);
        throw e;
      }
    }

    async function signInWithTrainingCode({ code, role: nextRole }) {
      const validation = await validateTrainingSessionCode(code);
      if (!validation.ok) throw new Error(validation.reason || "Invalid training code.");

      assignedRoleRef.current = nextRole || "guest";
      try {
        localStorage.setItem("bshm_training_override", "true");
      } catch {
        // ignore
      }
      setTrainingMode(true);

      const res = await signInAnonymously(auth);
      const uid = res.user.uid;

      setRole(assignedRoleRef.current);

      await createUserProfile({
        uid,
        email: null,
        role: nextRole || "guest",
        fullName: "Training User",
        trainingMode: true,
      });
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

        try {
          localStorage.removeItem("bshm_training_override");
        } catch {
          // ignore
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

    return { login, register, logout, signInWithTrainingCode, forgotPassword };
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


