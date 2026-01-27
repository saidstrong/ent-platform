#!/usr/bin/env ts-node

/**
 * Backfill lesson.courseId and assignment.courseId using module/lesson relationships.
 * Usage: ts-node scripts/backfill-course-ids.ts [--dry-run]
 * Requires FIREBASE_CONFIG or GOOGLE_APPLICATION_CREDENTIALS for admin SDK.
 */

import admin from "firebase-admin";

const dryRun = process.argv.includes("--dry-run");

async function initAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID or GCLOUD_PROJECT is required");
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!admin.apps.length) {
    if (credentialsPath) {
      const serviceAccount = await import(credentialsPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        projectId,
      });
    } else {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required to locate a service account JSON");
    }
  }
  return admin.firestore();
}

async function main() {
  const db = await initAdmin();

  console.log(`Starting backfill (dryRun=${dryRun})`);

  // Cache modules courseId
  const modulesSnap = await db.collection("modules").get();
  const moduleCourse: Record<string, string> = {};
  modulesSnap.forEach((doc) => {
    const data = doc.data();
    if (data.courseId) moduleCourse[doc.id] = data.courseId as string;
  });

  // Lessons
  const lessonsSnap = await db.collection("lessons").get();
  for (const doc of lessonsSnap.docs) {
    const data = doc.data();
    if (!data.courseId) {
      const courseId = moduleCourse[data.moduleId];
      if (courseId) {
        console.log(`Lesson ${doc.id} -> set courseId=${courseId}`);
        if (!dryRun) {
          await doc.ref.set({ courseId }, { merge: true });
        }
      } else {
        console.warn(`Lesson ${doc.id} missing module.courseId; skipped`);
      }
    }
  }

  // Assignments
  const lessonsMap: Record<string, admin.firestore.DocumentData> = {};
  lessonsSnap.forEach((d) => {
    lessonsMap[d.id] = d.data();
  });
  const assignmentsSnap = await db.collection("assignments").get();
  for (const doc of assignmentsSnap.docs) {
    const data = doc.data();
    if (!data.courseId) {
      const lesson = lessonsMap[data.lessonId];
      const courseId = lesson?.courseId || moduleCourse[lesson?.moduleId];
      if (courseId) {
        console.log(`Assignment ${doc.id} -> set courseId=${courseId}`);
        if (!dryRun) {
          await doc.ref.set({ courseId }, { merge: true });
        }
      } else {
        console.warn(`Assignment ${doc.id} missing courseId and cannot derive; skipped`);
      }
    }
  }

  console.log("Backfill complete");
}

main().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
