import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";

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

export async function GET(req: NextRequest) {
  const { log, respondError } = makeHelpers(req);
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
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (err) {
      log("error", stage, { code: "admin_not_configured", message: String(err) });
      return respondError(500, stage, "admin_not_configured", "Firebase Admin is not configured.");
    }

    let uid = "";
    try {
      stage = "auth:verify";
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log("warn", stage, { code: "invalid_token", message: detail });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.", detail);
    }

    stage = "auth:authorize";
    let role = "";
    try {
      const profileSnap = await db.collection("users").doc(uid).get();
      role = String(profileSnap.data()?.role || "");
    } catch (err) {
      log("error", stage, { code: "profile_read_failed", message: String(err) });
      return respondError(500, stage, "profile_read_failed", "Failed to read user profile.");
    }
    if (role !== "admin" && role !== "teacher") {
      return respondError(403, stage, "forbidden", "Access denied.");
    }

    stage = "req:parse";
    const courseId = req.nextUrl.searchParams.get("courseId") || "";
    const lessonId = req.nextUrl.searchParams.get("lessonId") || "";
    const daysRaw = req.nextUrl.searchParams.get("days");
    const days = Math.min(Math.max(Number(daysRaw || 14), 1), 60);
    if (!courseId) {
      return respondError(400, stage, "missing_course_id", "courseId is required.");
    }

    stage = lessonId ? "analytics:read:lesson" : "analytics:read:course";
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (days - 1));
    const dateKeys: string[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dateKeys.push(d.toISOString().slice(0, 10));
    }
    const docs: FirebaseFirestore.DocumentSnapshot[] = [];
    if (!lessonId) {
      log("info", stage);
      for (const date of dateKeys) {
        const docId = `aiad_${courseId}_all_${date}`;
        docs.push(await db.collection("aiAnalyticsDaily").doc(docId).get());
      }
    } else {
      let snap: FirebaseFirestore.QuerySnapshot | null = null;
      try {
        let query = db.collection("aiAnalyticsDaily").where("courseId", "==", courseId).where("lessonId", "==", lessonId);
        query = query.where("date", ">=", dateKeys[0]).where("date", "<=", dateKeys[dateKeys.length - 1]);
        query = query.orderBy("date", "desc").limit(days);
        snap = await query.get();
        docs.push(...snap.docs);
      } catch (err) {
        if (isMissingIndex(err)) {
          log("warn", "analytics:fallback_indexfree", { lessonId });
          for (const date of dateKeys) {
            const docId = `aiad_${courseId}_${lessonId}_${date}`;
            docs.push(await db.collection("aiAnalyticsDaily").doc(docId).get());
          }
        } else {
          log("error", stage, { code: "analytics_read_failed", message: String(err) });
          return respondError(500, stage, "analytics_read_failed", "Failed to load analytics.");
        }
      }
    }

    const totals = { totalRequests: 0 };
    const byMode: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const topQuestionMap = new Map<string, { qHash: string; exampleTruncated: string; count: number; lastSeenAt: number }>();

    stage = "analytics:aggregate";
    log("info", stage, { docs: docs.length });
    docs.forEach((doc) => {
      if (!doc.exists) return;
      const data = doc.data() || {};
      totals.totalRequests += Number(data.totalRequests || 0);
      const modeMap = data.byMode || {};
      const outcomeMap = data.byOutcome || {};
      Object.keys(modeMap).forEach((key) => {
        byMode[key] = (byMode[key] || 0) + Number(modeMap[key] || 0);
      });
      Object.keys(outcomeMap).forEach((key) => {
        byOutcome[key] = (byOutcome[key] || 0) + Number(outcomeMap[key] || 0);
      });
      const questions = Array.isArray(data.topQuestions) ? data.topQuestions : [];
      questions.forEach((q) => {
        if (!q?.qHash) return;
        const prev = topQuestionMap.get(q.qHash);
        const count = Number(q.count || 0);
        const lastSeenAt = q.lastSeenAt?.toMillis ? q.lastSeenAt.toMillis() : 0;
        if (!prev) {
          topQuestionMap.set(q.qHash, {
            qHash: q.qHash,
            exampleTruncated: q.exampleTruncated || "",
            count,
            lastSeenAt,
          });
        } else {
          topQuestionMap.set(q.qHash, {
            ...prev,
            count: prev.count + count,
            lastSeenAt: Math.max(prev.lastSeenAt, lastSeenAt),
          });
        }
      });
    });

    const topQuestions = Array.from(topQuestionMap.values())
      .sort((a, b) => {
        const diff = b.count - a.count;
        if (diff !== 0) return diff;
        return b.lastSeenAt - a.lastSeenAt;
      })
      .slice(0, 20)
      .map((q) => ({
        qHash: q.qHash,
        exampleTruncated: q.exampleTruncated,
        count: q.count,
        lastSeenAt: q.lastSeenAt ? new Date(q.lastSeenAt).toISOString() : null,
      }));

    const unsupportedCount = Number(byOutcome.unsupported || 0) + Number(byOutcome.policy_refusal || 0);
    const unsupportedRate = totals.totalRequests > 0
      ? Math.round((unsupportedCount / totals.totalRequests) * 100)
      : 0;

    return NextResponse.json({
      ok: true,
      courseId,
      lessonId: lessonId || null,
      scope: lessonId ? "lesson" : "course",
      days,
      totals,
      byMode,
      byOutcome,
      unsupportedRate,
      topQuestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}
