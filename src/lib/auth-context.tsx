'use client';

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import type { Language, Role, UserProfile } from "./types";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signup: (opts: { email: string; password: string; displayName: string; lang?: Language }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const snap = await getDoc(doc(db, "users", nextUser.uid));
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          const fallback: UserProfile = {
            uid: nextUser.uid,
            role: "student",
            displayName: nextUser.displayName || "",
            email: nextUser.email || "",
            createdAt: new Date().toISOString(),
          };
          setProfile(fallback);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signup = async ({ email, password, displayName, lang = "kz" }: { email: string; password: string; displayName: string; lang?: Language }) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      const profileDoc: UserProfile = {
        uid: cred.user.uid,
        role: "student",
        displayName,
        email,
        createdAt: new Date().toISOString(),
        lang,
      };
      await setDoc(doc(db, "users", cred.user.uid), { ...profileDoc, createdAt: serverTimestamp() });
      setProfile(profileDoc);
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") {
        const error = err as { code?: string; message?: string; customData?: unknown };
        console.error("[auth] signup failed", { code: error.code, message: error.message, customData: error.customData });
      }
      throw err;
    }
  };

  const login = async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") {
        const error = err as { code?: string; message?: string; customData?: unknown };
        console.error("[auth] login failed", { code: error.code, message: error.message, customData: error.customData });
      }
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  const value: AuthContextValue = { user, profile, loading, signup, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

export const isAdmin = (role?: Role | null) => role === "admin";
export const isTeacher = (role?: Role | null) => role === "teacher";
