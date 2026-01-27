#!/usr/bin/env ts-node

/**
 * Backfill submissions.courseId and submissions.lessonId using assignment references.
 * Usage: ts-node scripts/backfill-submissions-course-lesson.ts [--dry-run]
 * Requires GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID (or GCLOUD_PROJECT).
 */

import admin from "firebase-admin";

const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

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

  console.log(`Starting submissions backfill (dryRun=${dryRun})`);

  const targets = new Map<string, admin.firestore.QueryDocumentSnapshot>();

  const missingCourseSnap = await db.collection("submissions").where("courseId", "==", null).get();
  missingCourseSnap.forEach((doc) => targets.set(doc.id, doc));

  const missingLessonSnap = await db.collection("submissions").where("lessonId", "==", null).get();
  missingLessonSnap.forEach((doc) => targets.set(doc.id, doc));

  let updatedCount = 0;

  for (const doc of targets.values()) {
    const data = doc.data();
    if (!data.assignmentId) {
      console.warn(`Submission ${doc.id} missing assignmentId; skipped`);
      continue;
    }
    if (data.courseId && data.lessonId) {
      continue;
    }
    const assignmentSnap = await db.collection("assignments").doc(String(data.assignmentId)).get();
    if (!assignmentSnap.exists) {
      console.warn(`Assignment ${data.assignmentId} not found for submission ${doc.id}; skipped`);
      continue;
    }
    const assignment = assignmentSnap.data() as { courseId?: string; lessonId?: string };
    const courseId = data.courseId || assignment.courseId;
    const lessonId = data.lessonId || assignment.lessonId;
    if (!courseId || !lessonId) {
      console.warn(`Submission ${doc.id} missing courseId/lessonId after lookup; skipped`);
      continue;
    }
    updatedCount += 1;
    console.log(`Submission ${doc.id} -> courseId=${courseId}, lessonId=${lessonId}`);
    if (!dryRun) {
      await doc.ref.set(
        {
          courseId,
          lessonId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} submissions.`);
}

main().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
