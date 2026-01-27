#!/usr/bin/env ts-node

/**
 * Backfill enrollments for approved/confirmed payments.
 * Usage: ts-node scripts/backfill-enrollments.ts [--dry-run]
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const dryRun = process.argv.includes("--dry-run");

const getArgValue = (flag: string) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const resolveCredsPath = () => {
  const cliPath = getArgValue("--creds");
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidate = cliPath || envPath || "./serviceAccountKey.json";
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account JSON not found at: ${resolved}`);
  }
  return resolved;
};

async function initAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "ent-platform";
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID or GCLOUD_PROJECT is required");
  }

  const credentialsPath = resolveCredsPath();
  if (!admin.apps.length) {
    const raw = fs.readFileSync(credentialsPath, "utf8");
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      projectId,
    });
  }
  return admin.firestore();
}

async function main() {
  const db = await initAdmin();
  console.log("Starting enrollment backfill");
  console.log(`projectId=${process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "ent-platform"}`);
  console.log(`dryRun=${dryRun}`);
  console.log(`creds=${resolveCredsPath()}`);

  const paymentsSnap = await db
    .collection("payments")
    .where("status", "in", ["approved", "confirmed"])
    .get();

  let created = 0;
  for (const docSnap of paymentsSnap.docs) {
    const payment = docSnap.data() as { uid?: string; courseId?: string };
    const uid = payment.uid;
    const courseId = payment.courseId;
    if (!uid || !courseId) {
      console.warn(`Payment ${docSnap.id} missing uid/courseId; skipped`);
      continue;
    }
    const enrollmentId = `${uid}_${courseId}`;
    const enrollmentRef = db.doc(`enrollments/${enrollmentId}`);
    const enrollmentSnap = await enrollmentRef.get();
    if (enrollmentSnap.exists) continue;

    console.log(`Create enrollment ${enrollmentId}`);
    if (!dryRun) {
      await enrollmentRef.set(
        {
          uid,
          courseId,
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    created += 1;
  }

  console.log(`Backfill complete. Created ${created} enrollments.`);
}

main().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
