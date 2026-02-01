import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminServicesSafe } from "../../../../lib/firebase-admin";
import { extractPdfTextFromStorage } from "../../../../lib/pdf-text-extract";
import { createHash } from "crypto";

export const runtime = "nodejs";

const DAILY_MESSAGE_LIMIT = 20;
const MONTHLY_TOKEN_LIMIT = 120000;
const OPENAI_MODEL = "gpt-4.1-mini";

type SourceEntry = {
  type: "pdf" | "course";
  title: string;
  docId?: string;
  pages?: number[] | { from: number; to: number };
  excerptIds?: number[];
  snippet?: string;
};

const getDateKey = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

const getMonthKey = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
};

const extractReply = (data: any) => {
  if (typeof data?.output_text === "string") return data.output_text;
  if (Array.isArray(data?.output)) {
    for (const block of data.output) {
      const content = block?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type === "output_text" && typeof part?.text === "string") {
            return part.text;
          }
        }
      }
    }
  }
  return "";
};

const pickText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const buildContextPack = (course: any | null, lesson: any | null, lang: string) => {
  const parts: string[] = [];
  const sources: string[] = [];
  const courseTitle = pickText(course?.title_en) || pickText(course?.title_kz);
  const courseDesc =
    pickText(course?.description_en) ||
    pickText(course?.description_kz) ||
    pickText(course?.objectives_en) ||
    pickText(course?.objectives_kz) ||
    pickText(course?.syllabus_en) ||
    pickText(course?.syllabus_kz);
  const courseContextUsed = !!(courseTitle || courseDesc);
  if (courseContextUsed) {
    parts.push(`Course: ${courseTitle}\nDetails: ${courseDesc}`.trim());
    sources.push("Course metadata");
  }

  const lessonTitle = pickText(lesson?.title_en) || pickText(lesson?.title_kz);
  if (lessonTitle) {
    parts.push(`Lesson: ${lessonTitle}`.trim());
  }

  const aiContextKz = pickText(lesson?.aiContext?.kz);
  const aiContextEn = pickText(lesson?.aiContext?.en);
  let contextBody = "";
  let contextLabel = "";
  if (lang === "kz") {
    contextBody = aiContextKz || aiContextEn;
    contextLabel = aiContextKz ? "Lesson aiContext (kz)" : aiContextEn ? "Lesson aiContext (en)" : "";
  } else {
    contextBody = aiContextEn || aiContextKz;
    contextLabel = aiContextEn ? "Lesson aiContext (en)" : aiContextKz ? "Lesson aiContext (kz)" : "";
  }

  if (contextBody) {
    parts.push(`Lesson context:\n${contextBody}`.trim());
    if (contextLabel) sources.push(contextLabel);
  }

  return {
    contextText: parts.join("\n\n").trim(),
    sources,
    hasLessonContext: !!contextBody,
    courseContextUsed,
  };
};

const isPdfUrl = (url?: string | null) => {
  if (!url) return false;
  const clean = url.split("?")[0]?.toLowerCase();
  return clean.endsWith(".pdf");
};

const getStoragePathFromUrl = (url?: string | null) => {
  if (!url) return "";
  if (url.startsWith("gs://")) {
    const [, , ...rest] = url.split("/");
    return rest.join("/");
  }
  const match = url.match(/\/o\/([^?]+)/);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
};

const hashId = (value: string) => createHash("sha1").update(value).digest("hex");
const hashQuestion = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);

const truncateText = (text: string, maxChars: number) =>
  text.length > maxChars ? text.slice(0, maxChars) : text;

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

const tokenizeQuery = (query: string) =>
  query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

const extractKeywords = (query: string) => {
  const cleaned = query.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!cleaned) return [];
  const raw = cleaned.split(" ").filter(Boolean);
  const stop = new Set(["the", "and", "with", "from", "that", "this", "what", "who", "why", "how", "does", "is", "are", "was", "were", "for", "you", "your"]);
  const keywords = raw.filter((word) => {
    const lower = word.toLowerCase();
    if (lower.length < 4 || stop.has(lower)) return false;
    const isCapitalized = word[0] === word[0].toUpperCase() && word.slice(1) !== word.slice(1).toUpperCase();
    return isCapitalized || lower.length >= 5;
  });
  return Array.from(new Set(keywords.map((word) => word.toLowerCase())));
};

const countOccurrences = (haystack: string, needle: string) => {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
};

const scoreChunk = (chunk: string, queryTokens: string[], queryLower: string) => {
  const haystack = chunk.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    const hits = countOccurrences(haystack, token);
    if (hits > 0) score += hits * (token.length > 6 ? 2 : 1);
  }
  if (queryLower.length > 8 && haystack.includes(queryLower)) score += 10;
  return score;
};

const detectDefinitionQuery = (query: string) => {
  const lower = query.toLowerCase();
  const patterns = [
    /definition of\s+(.+?)(?:\?|$)/i,
    /define\s+(.+?)(?:\?|$)/i,
    /what is\s+(.+?)(?:\?|$)/i,
    /what does\s+(.+?)\s+mean(?:\?|$)/i,
    /meaning of\s+(.+?)(?:\?|$)/i,
    /according to\s+(.+?)(?:\?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return { isDefinition: true, term: match[1].trim() };
    }
  }
  return { isDefinition: /definition|define|what is|means|refers to/i.test(lower), term: "" };
};

const isExplicitSourceQuery = (message: string) => {
  const lower = message.toLowerCase();
  const patterns = [
    "according to",
    "in this pdf",
    "in this lesson",
    "in this chapter",
    "according to the pdf",
    "according to chapter",
    "as per",
    "согласно",
    "в этом pdf",
    "в этом файле",
    "в этом уроке",
    "в этой главе",
    "осы pdf",
    "осы файл",
    "осы сабақ",
    "осы бөлім",
    "бойынша",
  ];
  return patterns.some((pattern) => lower.includes(pattern));
};

const containsExplicitTerm = (text: string, terms: string[]) => {
  if (!text || terms.length === 0) return false;
  const lower = text.toLowerCase();
  return terms.some((term) => term && lower.includes(term.toLowerCase()));
};

const getRelatedKeywords = (texts: string[], max = 5) => {
  const combined = texts.join(" ").toLowerCase();
  if (!combined) return [];
  const tokens = combined
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
  const stop = new Set([
    "that",
    "this",
    "with",
    "from",
    "into",
    "over",
    "they",
    "their",
    "your",
    "been",
    "were",
    "will",
    "also",
    "have",
    "has",
    "which",
    "what",
    "when",
    "where",
    "such",
    "these",
    "those",
    "от",
    "что",
    "это",
    "как",
    "для",
    "при",
    "или",
    "они",
    "их",
    "вам",
    "және",
    "осы",
    "бұл",
    "сабақ",
  ]);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (stop.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([token]) => token);
};

const scoreDefinitionHit = (chunk: string, term: string) => {
  if (!term) return 0;
  const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${safeTerm}\\b\\s+(is|means|refers to|defined as)`, "i");
  return re.test(chunk) ? 50 : 0;
};

const summarizeRelated = (lang: string, keywords: string[]) => {
  const list = keywords.slice(0, 5).join(", ");
  if (lang === "kz") {
    return list
      ? `Берілген үзінділердегі байланысты тақырыптар: ${list}.`
      : "Берілген үзінділерде байланысты тақырыптар бар, нақтырақ сұрақ қойыңыз.";
  }
  if (lang === "ru") {
    return list
      ? `Связанные темы в выдержках: ${list}.`
      : "В выдержках есть связанные темы; уточните, что именно нужно.";
  }
  return list
    ? `Related topics from the excerpts: ${list}.`
    : "Related topics appear in the excerpts; please clarify your question.";
};

const isMostlyCyrillic = (text: string) => {
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return cyr > 0 && cyr >= lat * 0.6;
};

const isMostlyLatin = (text: string) => {
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return lat > 0 && lat >= cyr * 1.5;
};

const detectMessageLang = (message: string) => {
  const lower = message.toLowerCase();
  const kzChars = /[әғқңөұүһі]/i;
  const cyr = (message.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (message.match(/[A-Za-z]/g) || []).length;
  if (kzChars.test(lower)) return "kz";
  if (cyr > 0 && cyr >= lat * 1.2) return "ru";
  if (lat > 0 && lat >= cyr * 1.5) return "en";
  return "";
};

const detectCheatingIntent = (message: string) => {
  const text = message.toLowerCase();
  const patterns = [
    "give me the answer",
    "final answer",
    "just the answer",
    "full solution",
    "solve it",
    "complete solution",
    "answer only",
    "решение полностью",
    "дай ответ",
    "просто ответ",
    "толық шешім",
    "тек жауабы",
    "дай решение",
  ];
  return patterns.some((pattern) => text.includes(pattern));
};

const normalizeQuestion = (message: string) =>
  message.toLowerCase().replace(/\s+/g, " ").trim();

const getDateString = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getAnalyticsDocId = (courseId: string, lessonId: string | null, date: string) =>
  `aiad_${courseId}_${lessonId || "all"}_${date}`;

const buildAnalyticsPayload = (
  data: any,
  params: {
    courseId: string;
    lessonId: string | null;
    date: string;
    mode: string;
    outcome: string;
    qHash: string;
    exampleTruncated: string;
    now: Date;
  },
) => {
  const totalRequests = Number(data?.totalRequests || 0) + 1;
  const byMode = { ...(data?.byMode || {}) } as Record<string, number>;
  byMode[params.mode] = Number(byMode[params.mode] || 0) + 1;
  const byOutcome = { ...(data?.byOutcome || {}) } as Record<string, number>;
  byOutcome[params.outcome] = Number(byOutcome[params.outcome] || 0) + 1;
  const current = Array.isArray(data?.topQuestions) ? data.topQuestions : [];
  const updated = [...current];
  const existingIndex = updated.findIndex((q) => q?.qHash === params.qHash);
  const nowTs = admin.firestore.Timestamp.fromDate(params.now);
  if (existingIndex >= 0) {
    updated[existingIndex] = {
      ...updated[existingIndex],
      count: Number(updated[existingIndex].count || 0) + 1,
      lastSeenAt: nowTs,
    };
  } else {
    updated.push({
      qHash: params.qHash,
      exampleTruncated: params.exampleTruncated,
      count: 1,
      lastSeenAt: nowTs,
    });
  }
  updated.sort((a, b) => {
    const diff = Number(b.count || 0) - Number(a.count || 0);
    if (diff !== 0) return diff;
    const aTime = a.lastSeenAt?.toMillis ? a.lastSeenAt.toMillis() : 0;
    const bTime = b.lastSeenAt?.toMillis ? b.lastSeenAt.toMillis() : 0;
    return bTime - aTime;
  });
  return {
    courseId: params.courseId,
    lessonId: params.lessonId,
    date: params.date,
    totalRequests,
    byMode,
    byOutcome,
    topQuestions: updated.slice(0, 20),
    updatedAt: nowTs,
  };
};

const writeAnalytics = async (
  db: FirebaseFirestore.Firestore,
  params: {
    courseId: string;
    lessonId: string | null;
    date: string;
    mode: string;
    outcome: string;
    qHash: string;
    exampleTruncated: string;
    now: Date;
  },
) => {
  const lessonId = params.lessonId ? String(params.lessonId) : null;
  const courseRef = db.collection("aiAnalyticsDaily").doc(getAnalyticsDocId(params.courseId, null, params.date));
  const lessonRef = lessonId
    ? db.collection("aiAnalyticsDaily").doc(getAnalyticsDocId(params.courseId, lessonId, params.date))
    : null;
  const [courseSnap, lessonSnap] = await Promise.all([
    courseRef.get(),
    lessonRef ? lessonRef.get() : Promise.resolve(null),
  ]);
  const writes: Array<Promise<FirebaseFirestore.WriteResult>> = [];
  if (lessonRef && lessonSnap) {
    writes.push(lessonRef.set(buildAnalyticsPayload(lessonSnap.data(), { ...params, lessonId }), { merge: true }));
  }
  writes.push(courseRef.set(buildAnalyticsPayload(courseSnap.data(), { ...params, lessonId: null }), { merge: true }));
  await Promise.all(writes);
};

const isPdfResource = (resource: {
  name?: string;
  contentType?: string;
  url?: string;
  downloadUrl?: string;
}) => {
  const name = resource.name || "";
  const contentType = resource.contentType || "";
  const url = resource.downloadUrl || resource.url || "";
  if (contentType.toLowerCase().includes("pdf")) return true;
  if (isPdfUrl(name)) return true;
  if (isPdfUrl(url)) return true;
  return /application\/pdf/i.test(url);
};

const getLessonPdfResources = async (
  db: FirebaseFirestore.Firestore,
  courseId: string,
  lessonId: string,
  lessonData: any,
) => {
  const normalized: Array<{
    id?: string;
    name: string;
    storagePath?: string;
    downloadUrl?: string;
    contentType?: string;
  }> = [];
  const pushResource = (resource: any) => {
    if (!resource) return;
    const name = resource.name || resource.filename || "PDF";
    const downloadUrl = resource.downloadUrl || resource.url || resource.fileUrl || "";
    const storagePath = resource.storagePath || resource.path || getStoragePathFromUrl(downloadUrl);
    const contentType = resource.contentType || resource.mimeType || "";
    const next = { id: resource.id, name, downloadUrl, storagePath, contentType };
    if (!isPdfResource(next)) return;
    normalized.push(next);
  };

  if (Array.isArray(lessonData?.resources)) {
    lessonData.resources.forEach(pushResource);
  }
  if (Array.isArray(lessonData?.attachments)) {
    lessonData.attachments.forEach((att: any) =>
      pushResource({ name: att?.name, url: att?.url }),
    );
  }
  if (Array.isArray(lessonData?.files)) {
    lessonData.files.forEach(pushResource);
  }
  if (Array.isArray(lessonData?.materials)) {
    lessonData.materials.forEach(pushResource);
  }

  const subcollections = ["resources", "lessonResources", "files"];
  for (const sub of subcollections) {
    try {
      const snap = await db.collection("lessons").doc(lessonId).collection(sub).get();
      if (!snap.empty) {
        snap.docs.forEach((doc) => pushResource({ id: doc.id, ...doc.data() }));
      }
    } catch {
      // ignore missing subcollections
    }
  }

  const seen = new Set<string>();
  return normalized.filter((res) => {
    const key = res.id || res.storagePath || res.downloadUrl || res.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-vercel-id") || crypto.randomUUID();
  const log = (level: "info" | "warn" | "error", stage: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "production" && stage !== "admin:init") return;
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
    log("info", stage, {
      env: {
        FIREBASE_SERVICE_ACCOUNT_JSON: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
        FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        FIREBASE_SERVICE_ACCOUNT_B64: !!process.env.FIREBASE_SERVICE_ACCOUNT_B64,
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: !!process.env.GOOGLE_CLOUD_PROJECT,
      },
    });
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
      log("warn", stage, { code: "invalid_token", message: String(err) });
      return respondError(401, stage, "invalid_token", "Invalid or expired token.");
    }

    stage = "req:parse";
    log("info", stage);
    let message: string;
    let courseId: unknown;
    let lessonId: unknown;
    let threadId: unknown;
    let newThread: unknown;
    let langBody: unknown;
    let modeBody: unknown;
    let contextType: unknown;
    let path: unknown;
    let clientRequestId: unknown;
    try {
      ({
        message,
        courseId,
        lessonId,
        threadId,
        newThread,
        lang: langBody,
        mode: modeBody,
        contextType,
        path,
        clientRequestId,
      } = await req.json());
    } catch (err) {
      log("warn", stage, { code: "invalid_json", message: String(err) });
      return respondError(400, stage, "invalid_json", "Invalid JSON body.");
    }
    if (!message || typeof message !== "string") {
      return respondError(400, stage, "invalid_message", "Message is required.");
    }
    const cookieLang = req.cookies?.get?.("lang")?.value || "";
    const acceptLang = req.headers.get("accept-language") || "";
    const msgLang = detectMessageLang(message);
    const inferredLang =
      /(^|,)\s*(kk|kz)\b/i.test(acceptLang) ? "kz" :
      /(^|,)\s*(ru)\b/i.test(acceptLang) ? "ru" :
      "en";
    const langSource =
      (langBody === "kz" || langBody === "en" || langBody === "ru") ? "body" :
      msgLang ? "message" :
      cookieLang ? "cookie" :
      acceptLang ? "header" :
      "default";
    const lang =
      (langBody === "kz" || langBody === "en" || langBody === "ru") ? langBody :
      msgLang ? msgLang :
      (cookieLang === "kz" || cookieLang === "ru" || cookieLang === "en") ? cookieLang :
      inferredLang;
    stage = "context:lang";
    log("info", stage, { lang, source: langSource });

    const now = new Date();
    const dateKey = getDateKey(now);
    const monthKey = getMonthKey(now);
    const dailyRef = db.collection("aiUsage").doc(`${uid}_${dateKey}`);
    const monthlyRef = db.collection("aiUsageMonthly").doc(`${uid}_${monthKey}`);

    stage = "quota:read";
    log("info", stage);
    let dailySnap;
    let monthlySnap;
    try {
      [dailySnap, monthlySnap] = await Promise.all([dailyRef.get(), monthlyRef.get()]);
    } catch (err) {
      log("error", stage, { code: "quota_read_failed", message: String(err) });
      return respondError(500, stage, "quota_read_failed", "Failed to read quota.");
    }
    const dailyCount = dailySnap.exists ? Number(dailySnap.data()?.count || 0) : 0;
    const monthlyTokens = monthlySnap.exists ? Number(monthlySnap.data()?.tokensUsed || 0) : 0;

    if (dailyCount >= DAILY_MESSAGE_LIMIT) {
      return respondError(429, "quota:read", "daily_limit", "Daily quota exceeded.");
    }
    if (monthlyTokens >= MONTHLY_TOKEN_LIMIT) {
      return respondError(429, "quota:read", "monthly_limit", "Monthly quota exceeded.");
    }

    if (!process.env.OPENAI_API_KEY) {
      return respondError(500, "openai:request", "openai_missing_key", "OpenAI API key not configured.");
    }

    stage = "context:load";
    log("info", stage);
    let courseDoc: any = null;
    let lessonDoc: any = null;
    try {
      courseDoc = courseId ? await db.collection("courses").doc(String(courseId)).get() : null;
      lessonDoc = lessonId ? await db.collection("lessons").doc(String(lessonId)).get() : null;
    } catch (err) {
      log("error", stage, { code: "context_read_failed", message: String(err) });
      return respondError(500, stage, "context_read_failed", "Failed to load context.");
    }
    stage = "context:pack";
    log("info", stage);
    const lessonData = lessonDoc?.data() || null;
    const { contextText, sources, hasLessonContext, courseContextUsed } = buildContextPack(
      courseDoc?.data() || null,
      lessonData,
      lang,
    );

    const policyDefault = {
      lesson: { allowDirectAnswers: true, allowFullSolutions: true, style: "explain" },
      course: { allowDirectAnswers: true, allowFullSolutions: true, style: "explain" },
      quiz: { allowDirectAnswers: false, allowFullSolutions: false, style: "socratic" },
      assignment: { allowDirectAnswers: false, allowFullSolutions: false, style: "socratic" },
    } as const;
    const validModes = ["lesson", "course", "quiz", "assignment"] as const;
    const resolvedPath = typeof path === "string" ? path : "";
    const resolveModeFromPath = (value: string) => {
      if (value.includes("/assignment/")) return "assignment";
      if (value.includes("/quiz/")) return "quiz";
      return "";
    };
    const policyFromLesson = lessonData?.aiPolicy || {};
    const policyFromCourse = courseDoc?.data()?.aiPolicy || {};
    const bodyMode =
      typeof modeBody === "string" && validModes.includes(modeBody as any) ? modeBody : "";
    const contextMode =
      typeof contextType === "string" && validModes.includes(contextType as any)
        ? contextType
        : "";
    const inferredMode =
      bodyMode ||
      contextMode ||
      resolveModeFromPath(resolvedPath) ||
      policyFromLesson?.defaultMode ||
      policyFromCourse?.defaultMode ||
      (lessonData?.type === "quiz" ? "quiz" : "") ||
      (courseId && !lessonId ? "course" : "") ||
      "lesson";
    const mode = validModes.includes(inferredMode as any) ? inferredMode : "lesson";
    const modeSource =
      bodyMode ? "body" :
      contextMode ? "context" :
      resolveModeFromPath(resolvedPath) ? "path" :
      policyFromLesson?.defaultMode || policyFromCourse?.defaultMode ? "policy" :
      "inferred";
    stage = "context:mode";
    log("info", stage, { mode, source: modeSource });

    const defaultPolicy = policyDefault[mode as keyof typeof policyDefault] || policyDefault.lesson;
    const policyApplied = {
      allowDirectAnswers:
        typeof policyFromLesson?.allowDirectAnswers === "boolean"
          ? policyFromLesson.allowDirectAnswers
          : typeof policyFromCourse?.allowDirectAnswers === "boolean"
            ? policyFromCourse.allowDirectAnswers
            : defaultPolicy.allowDirectAnswers,
      allowFullSolutions:
        typeof policyFromLesson?.allowFullSolutions === "boolean"
          ? policyFromLesson.allowFullSolutions
          : typeof policyFromCourse?.allowFullSolutions === "boolean"
            ? policyFromCourse.allowFullSolutions
            : defaultPolicy.allowFullSolutions,
      style:
        policyFromLesson?.style ||
        policyFromCourse?.style ||
        defaultPolicy.style,
      citationRequired:
        typeof policyFromLesson?.citationRequired === "boolean"
          ? policyFromLesson.citationRequired
          : typeof policyFromCourse?.citationRequired === "boolean"
            ? policyFromCourse.citationRequired
            : true,
      maxAnswerLength:
        typeof policyFromLesson?.maxAnswerLength === "number"
          ? policyFromLesson.maxAnswerLength
          : typeof policyFromCourse?.maxAnswerLength === "number"
            ? policyFromCourse.maxAnswerLength
            : 0,
    };
    const restrictedMode = mode === "quiz" || mode === "assignment";
    const cheatingIntent = detectCheatingIntent(message);
    const forceHint = restrictedMode && !policyApplied.allowDirectAnswers && cheatingIntent;
    if (forceHint) {
      log("warn", "policy:intercept", { mode, reason: "cheating_intent" });
    }

    const pdfSources: string[] = [];
    const pdfContextParts: string[] = [];
    const MAX_PDFS = 3;
    const MAX_PDF_CHARS_TOTAL = 20000;
    const MAX_PDF_CHARS_PER = 8000;
    const MAX_PDF_CHUNKS_PER_FILE = 3;
    const MAX_PDF_CHUNKS_TOTAL = 6;
    let pdfCharsUsed = 0;
    let pdfChunksUsed = 0;
    let pdfFoundCount = 0;
    let pdfResolvedCount = 0;
    const queryTokens = tokenizeQuery(message);
    const queryLower = message.toLowerCase().trim();
    const definitionQuery = detectDefinitionQuery(message);
    const lexicalKeywords = extractKeywords(message);
    if (lexicalKeywords.length > 0) {
      stage = "pdf:lexical:extractKeywords";
      log("info", stage, { count: lexicalKeywords.length });
    }

    stage = "pdf:list";
    log("info", stage);
    const pdfResources = await getLessonPdfResources(
      db,
      String(courseId || ""),
      String(lessonId || ""),
      lessonData,
    );
    pdfFoundCount = pdfResources.length;
    log("info", stage, {
      found: pdfFoundCount,
      lessonId: String(lessonId || ""),
      courseId: String(courseId || ""),
    });

    const selectedChunkIds = new Set<string>();
    const selectedChunkLabels: string[] = [];
    const selectedChunkTexts: string[] = [];
    const citationMeta: Array<{ resourceId: string; name: string; excerpts: number[] }> = [];
    const excerptNumbersByResource = new Map<string, { name: string; numbers: number[] }>();

    for (const resource of pdfResources.slice(0, MAX_PDFS)) {
      if (pdfCharsUsed >= MAX_PDF_CHARS_TOTAL) break;
      const storagePath = resource?.storagePath || getStoragePathFromUrl(resource?.downloadUrl || "");
      const name = resource?.name || "PDF";
      const resourceId = resource?.id || hashId(storagePath || resource?.downloadUrl || name);
      log("info", "pdf:resolve", {
        resourceId,
        name,
        hasStoragePath: Boolean(storagePath),
        hasDownloadUrl: Boolean(resource?.downloadUrl),
        resolved: Boolean(storagePath),
      });
      if (storagePath) pdfResolvedCount += 1;
      let cachedText = "";
      try {
        stage = "pdf:cache:read";
        log("info", stage, { resourceId });
        const cacheSnap = await db.collection("aiPdfTextCache").doc(resourceId).get();
        if (cacheSnap.exists) {
          cachedText = String(cacheSnap.data()?.text || "");
        }
      } catch (err) {
        log("warn", stage, { code: "pdf_cache_read_failed", message: String(err) });
      }

      if (!cachedText && storagePath) {
        try {
          stage = "pdf:extract";
          log("info", stage, { resourceId });
          const { text, metadata } = await extractPdfTextFromStorage(storagePath);
          cachedText = text || "";
          log("info", stage, {
            resourceId,
            bytes: metadata?.size ? Number(metadata.size) : undefined,
            textLen: cachedText.length,
          });
          stage = "pdf:cache:write";
          log("info", stage, { resourceId });
          await db.collection("aiPdfTextCache").doc(resourceId).set(
            {
              text: truncateText(cachedText, 40000),
              name,
              storagePath,
              contentType: metadata?.contentType || resource?.contentType || null,
                size: metadata?.size ? Number(metadata.size) : null,
              generation: metadata?.generation || null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } catch (err) {
          log("warn", stage, { code: "pdf_extract_failed", message: String(err) });
          cachedText = "";
        }
      }

        if (cachedText && pdfChunksUsed < MAX_PDF_CHUNKS_TOTAL) {
          try {
            stage = "pdf:chunk";
            log("info", stage, { resourceId });
            const chunks = chunkText(cachedText, 1000, 200);
            stage = "pdf:rank";
            log("info", stage, { resourceId });
            const scored = chunks.map((chunk, index) => ({
              index,
              chunk,
              score: scoreChunk(chunk, queryTokens, queryLower) + scoreDefinitionHit(chunk, definitionQuery.term),
            }));
            const sorted = scored.sort((a, b) => b.score - a.score);
            const selected = sorted
              .filter((item) => item.score > 0)
              .slice(0, MAX_PDF_CHUNKS_PER_FILE);
            const definitionMatches = definitionQuery.isDefinition
              ? sorted.filter((item) => scoreDefinitionHit(item.chunk, definitionQuery.term) > 0).slice(0, 2)
              : [];
            const lexicalMatches = lexicalKeywords.length
              ? chunks
                  .map((chunk, index) => ({
                    index,
                    chunk,
                    score: lexicalKeywords.reduce((acc, keyword) => acc + countOccurrences(chunk.toLowerCase(), keyword), 0),
                  }))
                  .filter((item) => item.score > 0)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 2)
              : [];
            if (lexicalMatches.length > 0) {
              stage = "pdf:lexical:select";
              log("info", stage, { resourceId, picked: lexicalMatches.length });
            }
            const finalSelected = [
              ...definitionMatches,
              ...lexicalMatches.filter((item) => !definitionMatches.some((d) => d.index === item.index)),
              ...selected.filter((item) =>
                !definitionMatches.some((d) => d.index === item.index) && !lexicalMatches.some((l) => l.index === item.index),
              ),
            ].slice(0, MAX_PDF_CHUNKS_PER_FILE);
            const fallbackSelected = finalSelected.length > 0 ? finalSelected : sorted.slice(0, 1);
            const pickedIndices: number[] = [];
            stage = "pdf:select";
            log("info", stage, { resourceId, picked: fallbackSelected.length });
            for (const item of fallbackSelected) {
              if (pdfChunksUsed >= MAX_PDF_CHUNKS_TOTAL || pdfCharsUsed >= MAX_PDF_CHARS_TOTAL) break;
              const remaining = Math.max(MAX_PDF_CHARS_TOTAL - pdfCharsUsed, 0);
              const excerpt = truncateText(item.chunk, Math.min(MAX_PDF_CHARS_PER, remaining));
              if (!excerpt) continue;
              const chunkId = `${resourceId}#${item.index}`;
              const chunkLabel = `PDF: ${name} (chunk ${item.index + 1}/${chunks.length}, id: ${chunkId})`;
              pdfContextParts.push(`${chunkLabel}\n${excerpt}`);
              pdfCharsUsed += excerpt.length;
              pdfChunksUsed += 1;
              pickedIndices.push(item.index + 1);
              selectedChunkIds.add(chunkId);
              selectedChunkLabels.push(chunkLabel);
              selectedChunkTexts.push(excerpt);
              const excerptEntry = excerptNumbersByResource.get(resourceId) || { name, numbers: [] };
              excerptEntry.numbers.push(item.index);
              excerptNumbersByResource.set(resourceId, excerptEntry);
            }
            if (pickedIndices.length > 0) {
              const entry = excerptNumbersByResource.get(resourceId);
              if (entry) {
                const unique = Array.from(new Set(entry.numbers)).sort((a, b) => a - b);
                citationMeta.push({ resourceId, name: entry.name, excerpts: unique });
                pdfSources.push(`${entry.name} excerpts: ${unique.join(", ")}`);
              }
            }
        } catch (err) {
          log("warn", stage, { code: "pdf_rank_failed", message: String(err) });
          const remaining = Math.max(MAX_PDF_CHARS_TOTAL - pdfCharsUsed, 0);
          const excerpt = truncateText(cachedText, Math.min(MAX_PDF_CHARS_PER, remaining));
            if (excerpt) {
              stage = "pdf:attach";
              log("info", stage, { resourceId });
              pdfContextParts.push(`PDF: ${name}\n${excerpt}`);
              pdfSources.push(`${name} pdf`);
              pdfCharsUsed += excerpt.length;
            }
        }
      }
    }

    stage = "pdf:attach";
    log("info", stage, { attachedCharsTotal: pdfCharsUsed, attachedPdfsCount: pdfSources.length });

    const combinedContextText = [contextText, ...pdfContextParts].filter(Boolean).join("\n\n").trim();
    const hasPdfContext = pdfContextParts.length > 0;
    const pdfUnreadable = pdfFoundCount > 0 && !hasPdfContext;
    const structuredSources: SourceEntry[] = [];
    if (courseContextUsed) {
      structuredSources.push({ type: "course", title: "Course metadata" });
    }
    citationMeta.forEach((entry) => {
      const excerptIds = Array.isArray(entry.excerpts)
        ? [...new Set(entry.excerpts)].sort((a, b) => a - b)
        : [];
      const pages = excerptIds.length
        ? { from: excerptIds[0] + 1, to: excerptIds[excerptIds.length - 1] + 1 }
        : undefined;
      structuredSources.push({
        type: "pdf",
        title: entry.name,
        docId: entry.resourceId,
        excerptIds,
        pages,
      });
    });

    const threadsRef = db.collection("aiThreads");
    let activeThreadId = typeof threadId === "string" && threadId.trim().length > 0 ? threadId.trim() : "";
    if (activeThreadId) {
      const existingThread = await threadsRef.doc(activeThreadId).get();
      if (!existingThread.exists || existingThread.data()?.uid !== uid) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    if (!activeThreadId && !newThread) {
      try {
        const latestThreadSnap = await threadsRef
          .where("uid", "==", uid)
          .where("courseId", "==", String(courseId || ""))
          .where("lessonId", "==", String(lessonId || ""))
          .orderBy("updatedAt", "desc")
          .limit(1)
          .get();
        if (!latestThreadSnap.empty) {
          activeThreadId = latestThreadSnap.docs[0].id;
        }
      } catch (err) {
        if (isMissingIndex(err)) {
          return respondError(
            409,
            "threads:read",
            "firestore_missing_index",
            "Firestore query requires a composite index.",
            "Create the aiThreads composite index for uid, courseId, lessonId, updatedAt.",
          );
        }
        return respondError(500, "threads:read", "threads_read_failed", "Failed to load threads.");
      }
    }

    if (!activeThreadId) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const newThreadDoc = await threadsRef.add({
        uid,
        courseId: String(courseId || ""),
        lessonId: String(lessonId || ""),
        title: "Lesson chat",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        messageCount: 0,
      });
      activeThreadId = newThreadDoc.id;
    }

    const messagesRef = threadsRef.doc(activeThreadId).collection("messages");
    const safeClientRequestId = typeof clientRequestId === "string" ? clientRequestId.trim() : "";
    if (safeClientRequestId) {
      stage = "chat:dedupe";
      try {
        const existing = await messagesRef.doc(`a_${safeClientRequestId}`).get();
        if (existing.exists) {
          const data = existing.data() || {};
          log("info", stage, { status: "duplicate" });
          return NextResponse.json({
            ok: true,
            answer: data.content || "",
            replyText: data.content || "",
            usage: { input_tokens: data.inputTokens || 0, output_tokens: data.outputTokens || 0 },
            remaining: {
              dailyMessagesLeft: Math.max(DAILY_MESSAGE_LIMIT - dailyCount, 0),
              monthlyTokensLeft: Math.max(MONTHLY_TOKEN_LIMIT - monthlyTokens, 0),
            },
            sources: data.sources || [],
            citations: data.citations || [],
            citationMeta: data.citationMeta || [],
            threadId: activeThreadId,
            mode: data.mode,
            policyApplied: data.policyApplied,
            requestId,
          });
        }
      } catch (err) {
        log("warn", stage, { code: "dedupe_check_failed", message: String(err) });
      }
    }
    const historySnap = await messagesRef.orderBy("createdAt", "desc").limit(10).get();
    const history = historySnap.docs
      .map((doc) => doc.data())
      .reverse()
      .map((msg) => ({ role: msg.role, content: msg.content }));

    const fallbackByLang = {
      en: "The teacher has not added lesson context yet. Please ask a more specific question or contact your teacher.",
      kz: "??? ????? ??????? ???????? ??? ??????????. ???????? ????? ??????? ?????? ????????? ????????????.",
      ru: "????????????? ??? ?? ??????? ???????? ??? ????? ?????. ???????? ?????? ??? ????????? ? ??????????????.",
    };
    const pdfUnreadableByLang = {
      en: "Lesson PDFs are attached but their text could not be read yet. Please try again later or ask a more specific question.",
      kz: "??????? PDF ???????? ????????, ????? ??????? ??????? ??? ?????? ?????? ???????. ????????? ???????? ??????? ?????? ???????? ????? ???????.",
      ru: "? ????? ??????????? PDF-?????, ?? ?? ????? ???? ?? ??????? ?????????. ?????????? ????? ??? ??????? ????? ?????? ??????.",
    };

    const questionNormalized = normalizeQuestion(message);
    const qHash = hashQuestion(questionNormalized);
    const exampleTruncated = truncateText(questionNormalized, 80);
    const relatedKeywords = getRelatedKeywords(selectedChunkTexts);
    const explicitQuery = isExplicitSourceQuery(message);
    const queryKeywords = Array.from(
      new Set([
        ...extractKeywords(message),
        ...tokenizeQuery(message).filter((token) => token.length >= 4),
      ]),
    );
    const keywordStop = new Set([
      "according",
      "chapter",
      "lesson",
      "pdf",
      "excerpts",
      "excerpts",
      "согласно",
      "глава",
      "урок",
      "файл",
      "сабақ",
      "бөлім",
    ]);
    const filteredKeywords = queryKeywords.filter((token) => !keywordStop.has(token));
    const excerptLower = selectedChunkTexts.join(" ").toLowerCase();
    const explicitMentionFound = filteredKeywords.length
      ? containsExplicitTerm(excerptLower, filteredKeywords)
      : true;
    const sensitiveTerms = [
      "cry",
      "crying",
      "drink",
      "drinking",
      "alcohol",
      "alcoholic",
      "tears",
      "плак",
      "слез",
      "алког",
      "пить",
      "ішу",
      "ішім",
      "ішеді",
      "жылай",
      "көзжас",
    ];
    const sensitiveRequested = containsExplicitTerm(message.toLowerCase(), sensitiveTerms);
    const sensitiveMentioned = containsExplicitTerm(excerptLower, sensitiveTerms);
    const forceNotMentioned =
      selectedChunkTexts.length > 0 &&
      ((explicitQuery && !explicitMentionFound) || (sensitiveRequested && !sensitiveMentioned));

    if (!hasLessonContext && !hasPdfContext) {
      stage = "context:missing";
      log("info", stage, { pdfFoundCount, pdfResolvedCount, pdfUnreadable });
      const replyText = lang == "kz"
        ? (pdfUnreadable ? pdfUnreadableByLang.kz : fallbackByLang.kz)
        : (pdfUnreadable ? pdfUnreadableByLang.en : fallbackByLang.en);
      const usage = { input_tokens: 0, output_tokens: 0 };
      const nextDaily = dailyCount + 1;
      const nextMonthly = monthlyTokens;
      stage = "quota:write";
      log("info", stage);
      try {
        await db.runTransaction(async (tx) => {
          tx.set(
            dailyRef,
            {
              uid,
              date: dateKey,
              count: nextDaily,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          tx.set(
            monthlyRef,
            {
              uid,
              month: monthKey,
              tokensUsed: nextMonthly,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          const now = admin.firestore.FieldValue.serverTimestamp();
          const threadRef = threadsRef.doc(activeThreadId);
          const userMessageRef = safeClientRequestId ? messagesRef.doc(`u_${safeClientRequestId}`) : messagesRef.doc();
          const assistantMessageRef = safeClientRequestId ? messagesRef.doc(`a_${safeClientRequestId}`) : messagesRef.doc();
          tx.set(userMessageRef, {
            role: "user",
            content: message,
            createdAt: now,
            courseId: String(courseId || ""),
            lessonId: String(lessonId || ""),
            uid,
          });
          tx.set(assistantMessageRef, {
            role: "assistant",
            content: replyText,
            createdAt: now,
            model: OPENAI_MODEL,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            totalTokens: usage.input_tokens + usage.output_tokens,
            courseId: String(courseId || ""),
            lessonId: String(lessonId || ""),
            uid,
            sources: structuredSources,
            citations: [],
            citationMeta: [],
            mode,
            policyApplied,
          });
          tx.set(
            threadRef,
            {
              updatedAt: now,
              lastMessageAt: now,
              messageCount: admin.firestore.FieldValue.increment(2),
            },
            { merge: true },
          );
        });
      } catch (err) {
        log("error", stage, { code: "quota_write_failed", message: String(err) });
        return respondError(500, stage, "quota_write_failed", "Failed to write quota.");
      }
      const outcome = pdfUnreadable ? "unsupported" : "unsupported";
      try {
        stage = "analytics:write";
        log("info", stage, { outcome });
        await writeAnalytics(db, {
          courseId: courseId ? String(courseId) : "unknown",
          lessonId: lessonId ? String(lessonId) : null,
          date: getDateString(now),
          mode,
          outcome,
          qHash,
          exampleTruncated,
          now,
        });
      } catch (err) {
        log("warn", stage, { code: "analytics_write_failed", message: String(err) });
      }
      return NextResponse.json({
        answer: replyText,
        replyText,
        threadId: activeThreadId,
        usage,
        sources: structuredSources,
        citations: [],
        citationMeta: [],
        pdfUnreadable,
        mode,
        policyApplied,
        remaining: {
          dailyMessagesLeft: Math.max(DAILY_MESSAGE_LIMIT - nextDaily, 0),
          monthlyTokensLeft: Math.max(MONTHLY_TOKEN_LIMIT - nextMonthly, 0),
        },
      });
    }

    const styleInstruction =
      policyApplied.style === "socratic"
        ? "Use a Socratic style with guiding questions and hints."
        : "Use a clear explanatory style with concise steps.";
    const policyInstruction =
      restrictedMode && !policyApplied.allowDirectAnswers
        ? "Do not provide final answers or full solutions. Offer hints, conceptual guidance, and questions only."
        : "Direct answers are allowed when supported by citations.";
    const fullSolutionInstruction =
      restrictedMode && !policyApplied.allowFullSolutions
        ? "Do not provide full worked solutions. Provide partial steps only."
        : "Full solutions are allowed when supported by citations.";
    const systemPrompt =
      `You are a helpful tutor for this platform. Use ONLY the provided context pack. If the context is insufficient, ask a clarifying question. Do not fabricate references or facts. ` +
      `If the user asks "according to the PDF/lesson/chapter" and the information is not present in the provided excerpts, respond exactly: "Not mentioned in the provided excerpts." Then provide only related context labeled as related, and ask one clarifying question. ` +
      `Do not include sources or citations text inside the answer string. ` +
      `Output must be ONLY in ${lang}. Do not mix languages. Translate any excerpt content into ${lang}. ` +
      `${styleInstruction} ${policyInstruction} ${fullSolutionInstruction} ` +
      `Return a JSON object with keys: answer (string), citations (array of chunk ids), confidence ("low"|"medium"|"high"), needsMoreContext (boolean), clarifyingQuestion (string or null). ` +
      `Every substantive claim must include at least one citation id from the provided chunks. ` +
      `If you cannot support the answer, set needsMoreContext=true, state that the excerpts do not support it, provide a brief related summary using citations, and ask one clarifying question.`;
    const systemContent = combinedContextText ? `Context pack:\n${combinedContextText}` : "Context pack: (empty)";

    stage = "openai:request";
    log("info", stage);
    let openaiRes: Response;
    try {
      openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: systemPrompt },
            { role: "system", content: systemContent },
            ...history,
            { role: "user", content: message },
          ],
        }),
      });
    } catch (err) {
      log("error", stage, { code: "openai_fetch_throw", message: String(err) });
      return respondError(502, stage, "openai_fetch_throw", "OpenAI request failed.", String(err));
    }

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      stage = "openai:response";
      log("error", stage, { code: "openai_non_2xx", status: openaiRes.status });
      return respondError(502, stage, "openai_non_2xx", "OpenAI returned non-2xx.", errText);
    }

    const data = await openaiRes.json();
    stage = "openai:parse";
    log("info", stage);
    const rawReplyText = extractReply(data) || "";
    let replyText = rawReplyText || "Sorry, I could not generate a reply.";
    let citations: string[] = [];
    let confidence: "low" | "medium" | "high" | undefined;
    let needsMoreContext: boolean | undefined;
    let clarifyingQuestion: string | null | undefined;
    if (rawReplyText) {
      try {
        const parsed = JSON.parse(rawReplyText);
        if (typeof parsed?.answer === "string") replyText = parsed.answer;
        if (Array.isArray(parsed?.citations)) citations = parsed.citations.filter((c: unknown) => typeof c === "string");
        if (parsed?.confidence === "low" || parsed?.confidence === "medium" || parsed?.confidence === "high") {
          confidence = parsed.confidence;
        }
        if (typeof parsed?.needsMoreContext === "boolean") needsMoreContext = parsed.needsMoreContext;
        if (typeof parsed?.clarifyingQuestion === "string") clarifyingQuestion = parsed.clarifyingQuestion;
      } catch (err) {
        log("warn", stage, { code: "openai_invalid_output", message: String(err) });
        // keep raw reply
      }
    }
    replyText = replyText.replace(/^\s*(Sources?|Citations?)\s*:.*$/gim, "").trim();

    stage = "openai:validate";
    log("info", stage);
    const relatedSummary = summarizeRelated(lang, relatedKeywords);
    const unsupportedTemplates = {
      en: {
        noSupport: "I can’t find direct support for that in the provided excerpts.",
        related: `Related context (from excerpts): ${relatedSummary}`,
        question: "Clarifying question: Which specific section or concept should I focus on?",
      },
      kz: {
        noSupport: "Берілген үзінділерде бұл сұраққа тікелей дәлел табылмады.",
        related: `Үзінділердегі байланысты мазмұн: ${relatedSummary}`,
        question: "Нақтылау сұрағы: Қай бөлімге немесе қандай ұғымға назар аударғаным дұрыс?",
      },
      ru: {
        noSupport: "В предоставленных отрывках нет прямого подтверждения этому.",
        related: `Связанная информация из выдержек: ${relatedSummary}`,
        question: "Уточняющий вопрос: на какой раздел или термин стоит ориентироваться?",
      },
    };
    const template = unsupportedTemplates[lang as "en" | "kz" | "ru"] || unsupportedTemplates.en;
    const unsupportedResponse = `${template.noSupport}\n${template.related}\n${template.question}`;
    const notMentionedTemplates = {
      en: {
        statement: "Not mentioned in the provided excerpts.",
        related: `Related context (from excerpts): ${relatedSummary}`,
        question: template.question,
      },
      kz: {
        statement: "Берілген үзінділерде бұл туралы нақты айтылмайды.",
        related: `Үзінділердегі байланысты мазмұн: ${relatedSummary}`,
        question: template.question,
      },
      ru: {
        statement: "В предоставленных выдержках это не упоминается.",
        related: `Связанная информация из выдержек: ${relatedSummary}`,
        question: template.question,
      },
    };
    const notMentionedTemplate =
      notMentionedTemplates[lang as "en" | "kz" | "ru"] || notMentionedTemplates.en;
    const notMentionedResponse = `${notMentionedTemplate.statement}\n${notMentionedTemplate.related}\n${notMentionedTemplate.question}`;

    const hintTemplates = {
      en: {
        noDirect: "I can help with hints, but I cannot provide a full direct answer here.",
        related: `Here are the closest related points from the materials: ${relatedSummary}`,
        question: "Clarifying question: Which part are you stuck on?",
      },
      kz: {
        noDirect: "Мен тек бағыт-бағдар мен кеңес бере аламын, толық жауап бере алмаймын.",
        related: `Материалдан жақын тақырыптар: ${relatedSummary}`,
        question: "Нақтылау сұрағы: Қай қадамда тоқтап қалдыңыз?",
      },
      ru: {
        noDirect: "Я могу помочь подсказками, но не могу дать полный прямой ответ.",
        related: `Ближайшие связанные темы из материалов: ${relatedSummary}`,
        question: "Уточняющий вопрос: На каком шаге вы застряли?",
      },
    };
    const hintTemplate = hintTemplates[lang as "en" | "kz" | "ru"] || hintTemplates.en;
    const hintResponse = `${hintTemplate.noDirect}\n${hintTemplate.related}\n${hintTemplate.question}`;

    const citationRequired = policyApplied.citationRequired !== false && selectedChunkIds.size > 0;
    const citationsInvalid = citations.some((id) => !selectedChunkIds.has(id));
    const hadInvalidCitations = citationsInvalid;
    if (citationsInvalid) {
      log("warn", stage, { code: "openai_invalid_citations", citationsInvalid });
      citations = citations.filter((id) => selectedChunkIds.has(id));
    }
    const citationsMissing = citations.length === 0;
    const citationIssue = citationRequired && citationsMissing && !hadInvalidCitations;
    const languageMismatch =
      (lang === "en" && isMostlyCyrillic(replyText)) ||
      ((lang === "kz" || lang === "ru") && isMostlyLatin(replyText));
    if (forceNotMentioned) {
      replyText = notMentionedResponse;
      citations = Array.from(selectedChunkIds).slice(0, 2);
      confidence = "low";
      needsMoreContext = true;
      clarifyingQuestion = notMentionedTemplate.question.replace(/^Clarifying question:\s*/i, "").trim();
    }
    if (forceHint) {
      replyText = hintResponse;
      citations = Array.from(selectedChunkIds).slice(0, 2);
      confidence = "low";
      needsMoreContext = true;
      clarifyingQuestion = hintTemplate.question;
      if (citations.length === 0) {
        replyText = unsupportedResponse;
        clarifyingQuestion = template.question.replace(/^Clarifying question:\s*/i, "").trim();
      }
    }

    if (!forceHint && !forceNotMentioned && (citationIssue || needsMoreContext || languageMismatch)) {
      log("warn", stage, {
        code: citationIssue ? "openai_invalid_citations" : "openai_language_mismatch",
        invalidCitations: citationIssue,
        needsMoreContext,
        languageMismatch,
      });
      replyText = unsupportedResponse;
      citations = [];
      confidence = "low";
      needsMoreContext = true;
      clarifyingQuestion = template.question.replace(/^Clarifying question:\s*/i, "").trim();
    }

    const outcome = forceHint
      ? "policy_refusal"
      : (citationIssue || languageMismatch || hadInvalidCitations)
        ? "error_recovered"
        : needsMoreContext
          ? "unsupported"
          : "ok";

    const usage = {
      input_tokens: Number(data?.usage?.input_tokens || 0),
      output_tokens: Number(data?.usage?.output_tokens || 0),
    };

    const nextDaily = dailyCount + 1;
    const nextMonthly = monthlyTokens + usage.input_tokens + usage.output_tokens;

    stage = "quota:write";
    log("info", stage);
    try {
      await db.runTransaction(async (tx) => {
        tx.set(
          dailyRef,
          {
            uid,
            date: dateKey,
            count: nextDaily,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        tx.set(
          monthlyRef,
          {
            uid,
            month: monthKey,
            tokensUsed: nextMonthly,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        const now = admin.firestore.FieldValue.serverTimestamp();
        const threadRef = threadsRef.doc(activeThreadId);
        const userMessageRef = safeClientRequestId ? messagesRef.doc(`u_${safeClientRequestId}`) : messagesRef.doc();
        const assistantMessageRef = safeClientRequestId ? messagesRef.doc(`a_${safeClientRequestId}`) : messagesRef.doc();
        tx.set(userMessageRef, {
          role: "user",
          content: message,
          createdAt: now,
          courseId: String(courseId || ""),
          lessonId: String(lessonId || ""),
          uid,
        });
        tx.set(assistantMessageRef, {
          role: "assistant",
          content: replyText,
          createdAt: now,
          model: OPENAI_MODEL,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
          courseId: String(courseId || ""),
          lessonId: String(lessonId || ""),
          uid,
          sources: structuredSources,
          citations,
          citationMeta,
          mode,
          policyApplied,
        });
        tx.set(
          threadRef,
          {
            updatedAt: now,
            lastMessageAt: now,
            messageCount: admin.firestore.FieldValue.increment(2),
          },
          { merge: true },
        );
      });
    } catch (err) {
      log("error", stage, { code: "quota_write_failed", message: String(err) });
      return respondError(500, stage, "quota_write_failed", "Failed to write quota.");
    }

    try {
      stage = "analytics:write";
      log("info", stage, { outcome });
      await writeAnalytics(db, {
        courseId: courseId ? String(courseId) : "unknown",
        lessonId: lessonId ? String(lessonId) : null,
        date: getDateString(now),
        mode,
        outcome,
        qHash,
        exampleTruncated,
        now,
      });
    } catch (err) {
      log("warn", stage, { code: "analytics_write_failed", message: String(err) });
    }

    return NextResponse.json({
      answer: replyText,
      replyText,
      threadId: activeThreadId,
      usage,
      sources: structuredSources,
      citations,
      citationMeta,
      pdfUnreadable,
      confidence,
      needsMoreContext,
      clarifyingQuestion,
      mode,
      policyApplied,
      remaining: {
        dailyMessagesLeft: Math.max(DAILY_MESSAGE_LIMIT - nextDaily, 0),
        monthlyTokensLeft: Math.max(MONTHLY_TOKEN_LIMIT - nextMonthly, 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    log("error", "unhandled", { message });
    return respondError(500, "unhandled", "unexpected", "Unhandled error.", message);
  }
}
