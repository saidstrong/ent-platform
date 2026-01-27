import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD-demo-placeholder",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "demo-sender",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "demo-app",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
// Dev-only: surface the projectId to catch env mismatches.
if (process.env.NODE_ENV !== "production") {
  console.info("[firebase] projectId", app.options.projectId);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (process.env.NODE_ENV !== "production") {
  setLogLevel("debug");
}
