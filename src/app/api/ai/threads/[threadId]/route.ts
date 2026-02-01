import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminServicesSafe } from "../../../../../lib/firebase-admin";

export const runtime = "nodejs";

const makeHelpers = (req: Request) => {
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
  return { requestId, log, respondError };
};

export async function GET(
  req: Request,
  context: { params: { threadId: string } | Promise<{ threadId: string }> },
) {
  const { log, respondError } = makeHelpers(req);
  let stage = "unhandled";
  try {
    stage = "req:validate";
    const params = await context.params;
    const threadId = typeof params?.threadId === "string" ? params.threadId.trim() : "";
    if (!threadId) {
      return respondError(400, stage, "invalid_thread_id", "Invalid threadId.");
    }

    stage = "auth:header";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      log("warn", stage, { code: "missing_auth" });
      return respondError(401, stage, "missing_auth", "Missing Authorization header.");
    }

    stage = "admin:init";
    log("info", stage);
    const adminServices = getAdminServicesSafe();
    if (!adminServices.ok) {
      log("error", stage, { code: adminServices.code, message: adminServices.detail });
      return respondError(500, stage, adminServices.code, "Firebase Admin is not configured.");
    }
    const { auth, db } = adminServices;

    let uid = "";
    try {
      stage = "auth:verify";
      log("info", stage);
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log("warn", stage, { code: "invalid_token", message: detail });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.", detail);
    }

    stage = "threads:read";
    log("info", stage);
    let threadSnap: FirebaseFirestore.DocumentSnapshot;
    try {
      threadSnap = await db.collection("aiThreads").doc(threadId).get();
    } catch (err) {
      log("error", stage, { code: "threads_read_failed", message: String(err) });
      return respondError(500, stage, "threads_read_failed", "Failed to load thread.");
    }
    if (!threadSnap.exists) {
      return respondError(404, stage, "thread_not_found", "Thread not found.");
    }
    const thread = threadSnap.data() as { uid?: string } | undefined;
    if (!thread || thread.uid !== uid) {
      return respondError(403, stage, "forbidden_thread_access", "Thread does not belong to user.");
    }
    let messagesSnap: FirebaseFirestore.QuerySnapshot;
    try {
      messagesSnap = await threadSnap.ref.collection("messages").orderBy("createdAt", "asc").limit(30).get();
    } catch (err) {
      log("error", stage, { code: "threads_read_failed", message: String(err) });
      return respondError(500, stage, "threads_read_failed", "Failed to load thread messages.");
    }
    stage = "response:serialize";
    log("info", stage);
    const messages = messagesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ thread: { id: threadId, ...thread }, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}

export async function PATCH(
  req: Request,
  context: { params: { threadId: string } | Promise<{ threadId: string }> },
) {
  const { log, respondError } = makeHelpers(req);
  let stage = "unhandled";
  try {
    stage = "req:validate";
    const params = await context.params;
    const threadId = typeof params?.threadId === "string" ? params.threadId.trim() : "";
    if (!threadId) {
      return respondError(400, stage, "invalid_thread_id", "Invalid threadId.");
    }

    stage = "auth:header";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      log("warn", stage, { code: "missing_auth" });
      return respondError(401, stage, "missing_auth", "Missing Authorization header.");
    }

    stage = "admin:init";
    log("info", stage);
    const adminServices = getAdminServicesSafe();
    if (!adminServices.ok) {
      log("error", stage, { code: adminServices.code, message: adminServices.detail });
      return respondError(500, stage, adminServices.code, "Firebase Admin is not configured.");
    }
    const { auth, db } = adminServices;

    stage = "req:parse";
    log("info", stage);
    let title: unknown;
    try {
      ({ title } = await req.json());
    } catch (err) {
      log("warn", stage, { code: "invalid_json", message: String(err) });
      return respondError(400, stage, "invalid_json", "Invalid JSON body.");
    }
    if (!title || typeof title !== "string") {
      return respondError(400, stage, "invalid_body", "Title is required.");
    }

    let uid = "";
    try {
      stage = "auth:verify";
      log("info", stage);
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log("warn", stage, { code: "invalid_token", message: detail });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.", detail);
    }

    stage = "threads:write";
    log("info", stage);
    let threadSnap: FirebaseFirestore.DocumentSnapshot;
    try {
      threadSnap = await db.collection("aiThreads").doc(threadId).get();
    } catch (err) {
      log("error", stage, { code: "threads_write_failed", message: String(err) });
      return respondError(500, stage, "threads_write_failed", "Failed to update thread.");
    }
    if (!threadSnap.exists) {
      return respondError(404, stage, "thread_not_found", "Thread not found.");
    }
    const thread = threadSnap.data() as { uid?: string } | undefined;
    if (!thread || thread.uid !== uid) {
      return respondError(403, stage, "forbidden_thread_access", "Thread does not belong to user.");
    }
    try {
      await threadSnap.ref.set(
        {
          title: title.trim().slice(0, 60),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return NextResponse.json({ ok: true });
    } catch (err) {
      log("error", stage, { code: "threads_write_failed", message: String(err) });
      return respondError(500, stage, "threads_write_failed", "Failed to update thread.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}

export async function DELETE(
  req: Request,
  context: { params: { threadId: string } | Promise<{ threadId: string }> },
) {
  const { log, respondError } = makeHelpers(req);
  let stage = "unhandled";
  try {
    stage = "req:validate";
    const params = await context.params;
    const threadId = typeof params?.threadId === "string" ? params.threadId.trim() : "";
    if (!threadId) {
      return respondError(400, stage, "invalid_thread_id", "Invalid threadId.");
    }

    stage = "auth:header";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      log("warn", stage, { code: "missing_auth" });
      return respondError(401, stage, "missing_auth", "Missing Authorization header.");
    }

    stage = "admin:init";
    log("info", stage);
    const adminServices = getAdminServicesSafe();
    if (!adminServices.ok) {
      log("error", stage, { code: adminServices.code, message: adminServices.detail });
      return respondError(500, stage, adminServices.code, "Firebase Admin is not configured.");
    }
    const { auth, db } = adminServices;

    let uid = "";
    try {
      stage = "auth:verify";
      log("info", stage);
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log("warn", stage, { code: "invalid_token", message: detail });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.", detail);
    }

    stage = "threads:write";
    log("info", stage);
    let threadSnap: FirebaseFirestore.DocumentSnapshot;
    try {
      threadSnap = await db.collection("aiThreads").doc(threadId).get();
    } catch (err) {
      log("error", stage, { code: "threads_write_failed", message: String(err) });
      return respondError(500, stage, "threads_write_failed", "Failed to delete thread.");
    }
    if (!threadSnap.exists) {
      return respondError(404, stage, "thread_not_found", "Thread not found.");
    }
    const thread = threadSnap.data() as { uid?: string } | undefined;
    if (!thread || thread.uid !== uid) {
      return respondError(403, stage, "forbidden_thread_access", "Thread does not belong to user.");
    }
    try {
      await db.recursiveDelete(threadSnap.ref);
      return NextResponse.json({ ok: true });
    } catch (err) {
      log("error", stage, { code: "threads_write_failed", message: String(err) });
      return respondError(500, stage, "threads_write_failed", "Failed to delete thread.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}
