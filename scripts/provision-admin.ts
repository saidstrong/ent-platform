#!/usr/bin/env ts-node

/**
 * Provision an admin role for a user (dev-only).
 * Usage: ts-node scripts/provision-admin.ts [--uid <uid>]
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";

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
  const uid = getArgValue("--uid") || "ZIFwZNprKIdna160oYX9zr5nGvw2";
  const db = await initAdmin();
  console.log("Provision admin role");
  console.log(`uid=${uid}`);
  console.log(`projectId=${process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "ent-platform"}`);
  console.log(`creds=${resolveCredsPath()}`);

  await db.doc(`users/${uid}`).set({ role: "admin" }, { merge: true });
  console.log("Admin role set successfully.");
}

main().catch((err) => {
  console.error("Provision admin failed", err);
  process.exit(1);
});
