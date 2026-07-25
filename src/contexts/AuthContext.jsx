/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
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

import { auth } from "@/firebase/firebase.config";
import { createUserProfile, getUserDoc } from "@/services/userService";
import {
  getTrainingSystemState,
  validateTrainingSessionCode,
} from "@/services/trainingService";

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
            setRole(null);
            setProfile(null);
            setTrainingMode(false);
            assignedRoleRef.current = null;
            setLoading(false);
            return;
          }

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

          const userDoc = await getUserDoc(firebaseUser.uid, {
            preferTraining: effectiveTrainingMode,
          });

          if (userDoc) {
            setProfile(userDoc);
            setRole(userDoc.role || "guest");
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
          setAuthError(e?.message || "Failed to detect user role.");
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

  const api = useMemo(() => {
    async function login({ email, password }) {
      setAuthError(null);
      setLoading(true);
      assignedRoleRef.current = null; 
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        setAuthError(e?.message || "Login failed.");
        setLoading(false);
        throw e;
      }
    }

    async function register({ email, password, fullName = "" }) {
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
          trainingMode: effectiveTrainingMode,
        });

        // Sign out so user must log in with their new account
        await signOut(auth);
      } catch (e) {
        setAuthError(e?.message || "Register failed.");
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
        setAuthError(e?.message || "Logout failed.");
        setLoading(false);
        throw e;
      }
    }

    async function forgotPassword({ email }) {
      await sendPasswordResetEmail(auth, email);
    }

    return { login, register, logout, signInWithTrainingCode, forgotPassword };
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      profile,
      trainingMode,
      loading,
      authError,
      ...api,
    }),
    [user, role, trainingMode, loading, authError, api]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}


