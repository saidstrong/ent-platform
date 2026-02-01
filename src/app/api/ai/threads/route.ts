import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-vercel-id") || crypto.randomUUID();
  const log = (level: "info" | "warn" | "error", stage: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "production") return;
    const payload = { requestId, stage, ...(data || {}) };
    if (level === "info") console.info("[ai]", payload);
    if (level === "warn") console.warn("[ai]", payload);
    if (level === "error") console.error("[ai]", payload);
  };
  const respondError = (
    status: number,
    stage: string,
    code: string,
    message: string,
    detail?: string,
  ) =>
    NextResponse.json(
      { ok: false, stage, code, message, detail, requestId },
      { status },
    );

  let stage = "unhandled";
  const isMissingIndex = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: number | string }).code;
    return (code === 9 || code === "9") && message.includes("requires an index");
  };
  try {
    stage = "auth:header";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      log("warn", stage, { code: "missing_auth" });
      return respondError(401, stage, "missing_auth", "Missing Authorization header.");
    }

    stage = "admin:init";
    let auth;
    let db;
    try {
      log("info", stage);
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (err) {
      log("error", stage, { code: "admin_not_configured", message: String(err) });
      return respondError(500, stage, "admin_not_configured", "Firebase Admin is not configured.");
    }

    let uid = "";
    try {
      stage = "auth:verify";
      log("info", stage);
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      log("warn", stage, { code: "invalid_token", message: String(err) });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.");
    }

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";

    stage = "threads:read";
    log("info", stage);
    let snap;
    try {
      snap = await db
        .collection("aiThreads")
        .where("uid", "==", uid)
        .where("courseId", "==", courseId)
        .where("lessonId", "==", lessonId)
        .orderBy("updatedAt", "desc")
        .limit(10)
        .get();
    } catch (err) {
      if (isMissingIndex(err)) {
        return respondError(
          409,
          stage,
          "firestore_missing_index",
          "Firestore query requires a composite index.",
          "Create the aiThreads composite index for uid, courseId, lessonId, updatedAt.",
        );
      }
      log("error", stage, { code: "threads_read_failed", message: String(err) });
      return respondError(500, stage, "threads_read_failed", "Failed to load threads.");
    }

    const threads = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ threads });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}
