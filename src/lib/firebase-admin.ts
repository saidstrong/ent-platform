import admin from "firebase-admin";

type AdminServicesOk = {
  ok: true;
  app: admin.app.App;
  auth: admin.auth.Auth;
  db: FirebaseFirestore.Firestore;
};

type AdminServicesError = {
  ok: false;
  code: "admin_not_configured";
  stage: "admin:init";
  detail: string;
};

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    const sa = JSON.parse(raw);

    // IMPORTANT: fix newline escaping in the private key
    if (sa?.private_key && typeof sa.private_key === "string") {
      sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    }

    return sa;
  } catch {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON: must be valid JSON with escaped newlines (\\n).");
  }
};

export const getAdminApp = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON. Provide service account JSON for server-side Firebase Admin.",
    );
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields (project_id/client_email/private_key).");
  }

  const projectId =
    serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      "Missing Firebase projectId. Provide project_id in service account or set FIREBASE_PROJECT_ID/GOOGLE_CLOUD_PROJECT.",
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });
};

export const getAdminAuth = () => getAdminApp().auth();
export const getAdminDb = () => getAdminApp().firestore();

export const getAdminServicesSafe = (): AdminServicesOk | AdminServicesError => {
  try {
    const app = getAdminApp();
    return { ok: true, app, auth: app.auth(), db: app.firestore() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "admin_not_configured", stage: "admin:init", detail };
  }
};
