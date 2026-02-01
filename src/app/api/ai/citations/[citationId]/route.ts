import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";

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

const chunkText = (text: string, chunkSize = 1000, overlap = 200) => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const step = Math.max(chunkSize - overlap, 1);
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
  }
  return chunks;
};

const truncateWords = (text: string, maxWords = 25) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
};

export async function GET(
  req: Request,
  context: { params: { citationId: string } | Promise<{ citationId: string }> },
) {
  const { log, respondError } = makeHelpers(req);
  let stage = "unhandled";
  try {
    stage = "req:validate";
    const params = await context.params;
    const citationId = typeof params?.citationId === "string" ? params.citationId.trim() : "";
    if (!citationId) {
      return respondError(400, stage, "invalid_citation_id", "Invalid citationId.");
    }
    const hashIndex = citationId.lastIndexOf("#");
    if (hashIndex <= 0) {
      return respondError(400, stage, "invalid_citation_id", "Invalid citationId.");
    }
    const resourceId = citationId.slice(0, hashIndex);
    const indexStr = citationId.slice(hashIndex + 1);
    const chunkIndex = Number.parseInt(indexStr, 10);
    if (!resourceId || Number.isNaN(chunkIndex) || chunkIndex < 0) {
      return respondError(400, stage, "invalid_citation_id", "Invalid citationId.");
    }

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

    try {
      stage = "auth:verify";
      log("info", stage);
      await auth.verifyIdToken(token);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log("warn", stage, { code: "invalid_token", message: detail });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.", detail);
    }

    stage = "citations:read";
    log("info", stage, { resourceId });
    let cacheSnap: FirebaseFirestore.DocumentSnapshot;
    try {
      cacheSnap = await db.collection("aiPdfTextCache").doc(resourceId).get();
    } catch (err) {
      log("error", stage, { code: "citation_read_failed", message: String(err) });
      return respondError(500, stage, "citation_read_failed", "Failed to load citation.");
    }
    if (!cacheSnap.exists) {
      return respondError(404, stage, "citation_not_found", "Citation not found.");
    }
    const cache = cacheSnap.data() as { text?: string; name?: string } | undefined;
    const text = typeof cache?.text === "string" ? cache.text : "";
    if (!text) {
      return respondError(404, stage, "citation_not_found", "Citation not found.");
    }

    stage = "citations:chunk";
    log("info", stage, { resourceId, chunkIndex });
    const chunks = chunkText(text, 1000, 200);
    if (chunkIndex >= chunks.length) {
      return respondError(404, stage, "citation_not_found", "Citation not found.");
    }
    const snippet = truncateWords(chunks[chunkIndex] || "", 25);
    stage = "citations:respond";
    log("info", stage, { resourceId, chunkIndex });
    return NextResponse.json({
      ok: true,
      resourceId,
      name: cache?.name || "PDF",
      citationId,
      snippet,
      chunkIndex,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}
