#!/usr/bin/env ts-node

/**
 * Test student payment creation using Firebase client SDK.
 * Usage (PowerShell):
 *   $env:TEST_EMAIL="student@example.com"
 *   $env:TEST_PASSWORD="password"
 *   $env:TEST_COURSE_ID="courseId"
 *   npx ts-node scripts/test-student-create-payment.ts
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var ${key}`);
  return value;
};

const firebaseConfig = {
  apiKey: required("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: required("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: required("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

async function main() {
  const email = required("TEST_EMAIL");
  const password = required("TEST_PASSWORD");
  const courseId = required("TEST_COURSE_ID");
  const spoofUid = process.env.TEST_SPOOF_UID;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const targetUid = spoofUid || uid;
  const paymentId = `${targetUid}_${courseId}`;

  const payload = {
    uid: targetUid,
    courseId,
    status: "pending",
    createdAt: serverTimestamp(),
  };

  console.log("Attempting payment create", { uid, targetUid, courseId, path: `payments/${paymentId}` });
  try {
    await setDoc(doc(db, "payments", paymentId), payload);
    console.log("Success: payment created", { paymentId });
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: string }).code : undefined;
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to create payment", { code, message });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test failed", err);
  process.exit(1);
});
