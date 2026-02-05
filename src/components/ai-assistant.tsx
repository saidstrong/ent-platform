'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Button from "./ui/button";
import Textarea from "./ui/textarea";
import Card from "./ui/card";
import { useAuth } from "../lib/auth-context";
import { useI18n } from "../lib/i18n";
import { fetchLesson } from "../lib/data";

type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  answerMarkdown?: string;
  citations?: CitationItem[];
  confidence?: "low" | "medium" | "high";
  needsMoreContext?: boolean;
  clarifyingQuestion?: string | null;
  sourcesLabel?: string;
  mode?: string;
  policyApplied?: {
    allowDirectAnswers?: boolean;
    allowFullSolutions?: boolean;
    style?: string;
    citationRequired?: boolean;
    maxAnswerLength?: number;
  };
};
type ThreadItem = { id: string; title: string; updatedAt?: string };
type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  answerMarkdown?: string;
  citations?: CitationItem[];
  confidence?: "low" | "medium" | "high";
  needsMoreContext?: boolean;
  clarifyingQuestion?: string | null;
  sourcesLabel?: string;
  mode?: string;
  createdAt?: any;
  policyApplied?: {
    allowDirectAnswers?: boolean;
    allowFullSolutions?: boolean;
    style?: string;
    citationRequired?: boolean;
    maxAnswerLength?: number;
  };
};

type CitationItem = {
  title?: string;
  url?: string;
  note?: string;
} | string;

type SourceOption = {
  id: string;
  type: "pdf" | "youtube";
  title: string;
};

type AttachmentItem = {
  id: string;
  name: string;
  type: string;
  text?: string;
  base64?: string;
};

type AssistantState = {
  open: boolean;
  toggle: () => void;
  close: () => void;
};

const AssistantContext = createContext<AssistantState | undefined>(undefined);

export const AssistantProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, toggle, close }), [open, toggle, close]);

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
};

export const useAssistant = () => {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error("useAssistant must be used within AssistantProvider");
  }
  return ctx;
};

const formatRemaining = (remaining?: { dailyMessagesLeft?: number; monthlyTokensLeft?: number }) => {
  if (!remaining) return null;
  return `${remaining.dailyMessagesLeft ?? 0} / ${remaining.monthlyTokensLeft ?? 0}`;
};

const stripMetaLines = (text: string) =>
  text.replace(/^\s*(Sources?|Citations?)\s*:.*$/gim, "").trim();

const tryParseJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const decodeJsonString = (value: string) => {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value;
  }
};

const extractAnswerFromRaw = (raw: string) => {
  if (!raw) return "";
  const parsed = tryParseJson(raw);
  if (parsed && typeof parsed.answerMarkdown === "string") return parsed.answerMarkdown;
  if (parsed && typeof parsed.answer === "string") return parsed.answer;
  const match = raw.match(/"answerMarkdown"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/);
  if (match?.[1]) {
    return decodeJsonString(match[1]);
  }
  return raw;
};

const resolveAssistantMarkdown = (raw?: string, answerMarkdown?: string) => {
  const base =
    typeof answerMarkdown === "string" && answerMarkdown.trim().length
      ? answerMarkdown
      : raw
        ? extractAnswerFromRaw(raw)
        : "";
  return stripMetaLines(base);
};

export const AssistantPanel = () => {
  const { open, close } = useAssistant();
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const params = useParams<{ courseId?: string; lessonId?: string }>();
  const pathname = usePathname();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<{ dailyMessagesLeft?: number; monthlyTokensLeft?: number } | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [newThreadNext, setNewThreadNext] = useState(false);
  const [threadBusy, setThreadBusy] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [availableSources, setAvailableSources] = useState<SourceOption[]>([]);
  const [selectedSources, setSelectedSources] = useState<SourceOption[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [showSourcesPicker, setShowSourcesPicker] = useState(false);
  const [selectedScope, setSelectedScope] = useState<"lesson" | "course" | "platform" | null>(null);
  const [policyInfo, setPolicyInfo] = useState<{ mode?: string; policyApplied?: ThreadMessage["policyApplied"] } | null>(
    null,
  );
  const threadsLoadingRef = useRef(false);
  const threadLoadingRef = useRef(false);
  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAsk = !!user && !loading;
  const scopeContext = useMemo(() => {
    const path = pathname || "";
    const lessonMatch = path.match(/^\/learn\/([^/]+)\/lesson\/([^/]+)/);
    const learnCourseMatch = path.match(/^\/learn\/([^/]+)/);
    const courseMatch = path.match(/^\/courses\/([^/]+)/);
    const parsedCourseId =
      lessonMatch?.[1] ||
      learnCourseMatch?.[1] ||
      courseMatch?.[1] ||
      (params?.courseId ? String(params.courseId) : "");
    const parsedLessonId = lessonMatch?.[2] || (params?.lessonId ? String(params.lessonId) : "");
    const scope = lessonMatch ? "lesson" : learnCourseMatch || courseMatch ? "course" : "platform";
    return { scope, courseId: parsedCourseId, lessonId: parsedLessonId };
  }, [pathname, params?.courseId, params?.lessonId]);
  const effectiveScope = selectedScope || scopeContext.scope;
  const groundedMode = selectedSources.length > 0;

  useEffect(() => {
    if (!open) return;
    if (effectiveScope !== "lesson" || !scopeContext.lessonId) {
      setAvailableSources([]);
      setSelectedSources([]);
      return;
    }
    let active = true;
    fetchLesson(scopeContext.lessonId)
      .then((lesson) => {
        if (!active) return;
        const nextSources: SourceOption[] = [];
        const pushPdf = (id: string, title: string) => {
          if (!id) return;
          if (nextSources.find((item) => item.id === id)) return;
          nextSources.push({ id, type: "pdf", title });
        };
        const pushYoutube = (id: string, title: string) => {
          if (!id) return;
          if (nextSources.find((item) => item.id === id)) return;
          nextSources.push({ id, type: "youtube", title });
        };
        lesson?.attachments?.forEach((att) => {
          const id = att.url || att.name;
          const name = att.name || "PDF";
          if (name.toLowerCase().endsWith(".pdf") || (att.url || "").toLowerCase().includes(".pdf")) {
            pushPdf(id, name);
          }
        });
        lesson?.resources?.forEach((res) => {
          const id = res.id || res.storagePath || res.downloadUrl || res.url || res.name;
          if (res.kind === "file") {
            const name = res.name || "PDF";
            const url = res.downloadUrl || res.url || "";
            if (res.contentType?.includes("pdf") || name.toLowerCase().endsWith(".pdf") || url.toLowerCase().includes(".pdf")) {
              pushPdf(id, name);
            }
          }
          if (res.kind === "youtube" && res.text) {
            pushYoutube(id, res.name || "YouTube transcript");
          }
        });
        setAvailableSources(nextSources);
        setSelectedSources((prev) => prev.filter((sel) => nextSources.some((src) => src.id === sel.id)));
      })
      .catch(() => {
        if (!active) return;
        setAvailableSources([]);
        setSelectedSources([]);
      });
    return () => {
      active = false;
    };
  }, [open, effectiveScope, scopeContext.lessonId]);

  useEffect(() => {
    if (!selectedScope) return;
    if (selectedScope === "lesson" && !scopeContext.lessonId) {
      setSelectedScope(null);
    }
  }, [selectedScope, scopeContext.lessonId]);

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: AttachmentItem[] = [];
    for (const file of Array.from(files)) {
      const name = file.name || "attachment";
      const type = file.type || "";
      const id = `${name}_${file.lastModified}_${file.size}`;
      const isPdf = type.includes("pdf") || name.toLowerCase().endsWith(".pdf");
      const isText = type.startsWith("text/") || name.toLowerCase().endsWith(".md") || name.toLowerCase().endsWith(".txt");
      if (!isPdf && !isText) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      if (isPdf) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        const base64 = btoa(binary);
        next.push({ id, name, type: "pdf", base64 });
      } else {
        const text = await file.text();
        next.push({ id, name, type: "text", text });
      }
    }
    if (next.length) {
      setAttachments((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]));
        next.forEach((item) => map.set(item.id, item));
        return Array.from(map.values());
      });
    }
  };

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit, retry = true) => {
      if (!user) {
        throw new Error("unauthenticated");
      }
      const token = await user.getIdToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401 && retry) {
        const fresh = await user.getIdToken(true);
        return fetch(url, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${fresh}`,
          },
        });
      }
      return res;
    },
    [user],
  );

  const loadThreads = useCallback(async () => {
    if (!user || threadsLoadingRef.current) return;
    threadsLoadingRef.current = true;
    const qs = new URLSearchParams();
    qs.set("scope", effectiveScope);
    if (effectiveScope === "lesson") {
      if (scopeContext.courseId) qs.set("courseId", scopeContext.courseId);
      if (scopeContext.lessonId) qs.set("lessonId", scopeContext.lessonId);
    } else if (effectiveScope === "course") {
      if (scopeContext.courseId) qs.set("courseId", scopeContext.courseId);
    }
    try {
      const res = await fetchWithAuth(`/api/ai/threads?${qs.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload?.ok !== false) {
        setThreads(payload.threads || []);
        if (!activeThreadId && payload.threads?.[0]?.id) {
          setActiveThreadId(payload.threads[0].id);
        }
      } else if (!res.ok) {
        setError(t("ai.genericError"));
      }
    } finally {
      threadsLoadingRef.current = false;
    }
  }, [user, scopeContext.courseId, scopeContext.lessonId, effectiveScope, activeThreadId, fetchWithAuth, t]);

  const loadThread = useCallback(
    async (threadId: string) => {
      if (!user || threadLoadingRef.current) return;
      threadLoadingRef.current = true;
      try {
        const res = await fetchWithAuth(`/api/ai/threads/${threadId}`);
        const payload = await res.json().catch(() => ({}));
        if (res.ok && payload?.ok !== false) {
          const msgs = (payload.messages || []).map((msg: ThreadMessage) => ({
            ...msg,
            sourcesLabel: msg.sourcesLabel || (msg as any).sourcesSummary || "",
          }));
          setThreadMessages((prev) => {
            const map = new Map<string, ThreadMessage>();
            prev.forEach((msg) => map.set(msg.id || `${msg.role}:${msg.content}`, msg));
            msgs.forEach((msg: ThreadMessage) => map.set(msg.id || `${msg.role}:${msg.content}`, msg));
            return Array.from(map.values());
          });
          const latest = [...msgs].reverse().find((msg: ThreadMessage) => msg.role === "assistant" && (msg.mode || msg.policyApplied));
          if (latest) {
            setPolicyInfo({ mode: latest.mode, policyApplied: latest.policyApplied });
          }
        } else if (!res.ok) {
          setError(t("ai.genericError"));
        }
      } finally {
        threadLoadingRef.current = false;
      }
    },
    [user, fetchWithAuth, t],
  );

  const upsertThreadMessage = useCallback((nextMessage: ThreadMessage) => {
    setThreadMessages((prev) => {
      const index = prev.findIndex((msg) => msg.id === nextMessage.id);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = { ...copy[index], ...nextMessage };
        return copy;
      }
      return [...prev, nextMessage];
    });
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    loadThreads().catch(() => null);
  }, [open, user, loadThreads]);

  useEffect(() => {
    if (!open) return;
    setActiveThreadId(null);
    setThreadMessages([]);
    setMessages([]);
    setNewThreadNext(false);
  }, [effectiveScope, open]);

  useEffect(() => {
    if (!activeThreadId || !user) {
      setThreadMessages([]);
      setPolicyInfo(null);
      return;
    }
    loadThread(activeThreadId).catch(() => null);
  }, [activeThreadId, user, loadThread]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    if (sendingRef.current) return;
    if (!user) {
      setError(t("ai.signInRequired"));
      return;
    }
    setError(null);
    const question = input.trim();
    const localCreatedAt = new Date();
    const clientRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setInput("");
    if (activeThreadId) {
      upsertThreadMessage({ id: `u_${clientRequestId}`, role: "user", content: question, createdAt: localCreatedAt });
    } else {
      setMessages((prev) => [...prev, { role: "user", text: question }]);
    }
    setSending(true);
    sendingRef.current = true;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: question,
          courseId: effectiveScope === "lesson" || effectiveScope === "course" ? scopeContext.courseId || null : null,
          lessonId: effectiveScope === "lesson" ? scopeContext.lessonId || null : null,
          threadId: activeThreadId,
          newThread: newThreadNext,
          path: pathname,
          clientRequestId,
          scope: effectiveScope,
          selectedSources: groundedMode ? selectedSources : [],
          attachments,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(t("ai.quotaExceeded"));
        }
        throw new Error(payload?.error || t("ai.genericError"));
      }
      const rawAnswer =
        typeof payload?.answerMarkdown === "string"
          ? payload.answerMarkdown
          : typeof payload?.answer === "string"
            ? payload.answer
            : payload.replyText;
      const answerText = resolveAssistantMarkdown(rawAnswer, payload?.answerMarkdown);
      const sourcesLabel = payload.sourcesLabel || payload.sourcesSummary || "";
      if (activeThreadId) {
        upsertThreadMessage({
          id: `a_${clientRequestId}`,
          role: "assistant",
          content: answerText,
          answerMarkdown: answerText,
          citations: payload.citations,
          confidence: payload.confidence,
          needsMoreContext: payload.needsMoreContext,
          clarifyingQuestion: payload.clarifyingQuestion,
          sourcesLabel,
          createdAt: localCreatedAt,
          mode: payload.mode,
          policyApplied: payload.policyApplied,
        });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: answerText,
            answerMarkdown: answerText,
            citations: payload.citations,
            confidence: payload.confidence,
            needsMoreContext: payload.needsMoreContext,
            clarifyingQuestion: payload.clarifyingQuestion,
            sourcesLabel,
            mode: payload.mode,
            policyApplied: payload.policyApplied,
          },
        ]);
      }
      setRemaining(payload.remaining || null);
      if (payload.mode || payload.policyApplied) {
        setPolicyInfo({ mode: payload.mode, policyApplied: payload.policyApplied });
      }
      if (payload.threadId) {
        setActiveThreadId(payload.threadId);
        setNewThreadNext(false);
        setMessages([]);
        loadThreads().catch(() => null);
      }
      if (payload.threadId) {
        loadThread(payload.threadId).catch(() => null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("ai.genericError");
      setError(message);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const modeLabel = (mode?: string) => {
    if (mode === "course") return t("ai.modeCourse");
    if (mode === "quiz") return t("ai.modeQuiz");
    if (mode === "assignment") return t("ai.modeAssignment");
    return t("ai.modeLesson");
  };
  const inferredMode = useMemo(() => {
    if (pathname?.includes("/assignment/")) return "assignment";
    if (pathname?.includes("/quiz/")) return "quiz";
    if (params?.courseId && !params?.lessonId) return "course";
    return "lesson";
  }, [pathname, params?.courseId, params?.lessonId]);

  const effectiveMode = policyInfo?.mode || inferredMode;
  const hintModeEnabled =
    policyInfo?.policyApplied &&
    policyInfo.policyApplied.allowDirectAnswers === false &&
    (effectiveMode === "quiz" || effectiveMode === "assignment");

  const sortedThreadMessages = useMemo(() => {
    const roleWeight = (role: ThreadMessage["role"]) => {
      if (role === "system") return 0;
      if (role === "user") return 1;
      return 2;
    };
    const getTimestamp = (value: any) => {
      if (!value) return null;
      if (value instanceof Date) return value.getTime();
      if (typeof value?.toDate === "function") return value.toDate().getTime();
      if (typeof value?.seconds === "number") return value.seconds * 1000;
      if (typeof value?._seconds === "number") return value._seconds * 1000;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    };
    return threadMessages
      .map((msg, index) => ({ msg, index, ts: getTimestamp(msg.createdAt) }))
      .sort((a, b) => {
        if (a.ts != null && b.ts != null) {
          if (a.ts !== b.ts) return a.ts - b.ts;
          return roleWeight(a.msg.role) - roleWeight(b.msg.role);
        }
        if (a.ts != null) return -1;
        if (b.ts != null) return 1;
        return a.index - b.index;
      })
      .map((entry) => entry.msg);
  }, [threadMessages]);

  const dedupedThreadMessages = useMemo(() => {
    const seen = new Set<string>();
    return sortedThreadMessages.filter((msg) => {
      const key = msg.id || `${msg.role}:${msg.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sortedThreadMessages]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, dedupedThreadMessages.length, messages.length, sending]);

  const renderDetails = (
    messageKey: string,
    details: {
      sourcesLabel?: string;
      citations?: CitationItem[];
      confidence?: "low" | "medium" | "high";
      needsMoreContext?: boolean;
      clarifyingQuestion?: string | null;
    },
  ) => {
    const { sourcesLabel, citations, confidence, needsMoreContext, clarifyingQuestion } = details;
    const citationsList = citations || [];
    const showDetails = !!expandedDetails[messageKey];
    const hasDetails =
      !!sourcesLabel ||
      citationsList.length > 0 ||
      !!confidence ||
      !!clarifyingQuestion ||
      typeof needsMoreContext === "boolean";
    if (!hasDetails) return null;
    return (
      <div className="mt-2 space-y-2 text-[11px] text-[var(--muted)]">
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text)] hover:opacity-80"
          onClick={() => setExpandedDetails((prev) => ({ ...prev, [messageKey]: !prev[messageKey] }))}
        >
          {showDetails ? "Hide details" : "Details"}
        </button>
        {showDetails && (
          <div className="space-y-2">
            {sourcesLabel ? <div>{sourcesLabel}</div> : null}
            {confidence ? <div>Confidence: {confidence}</div> : null}
            {typeof needsMoreContext === "boolean" ? (
              <div>Needs more context: {needsMoreContext ? "Yes" : "No"}</div>
            ) : null}
            {clarifyingQuestion ? <div>Clarifying question: {clarifyingQuestion}</div> : null}
            {citationsList.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-[var(--muted)]">Citations</div>
                <ul className="list-disc space-y-1 pl-4 text-[10px] text-[var(--text)]">
                  {citationsList.map((item, idx) => {
                    if (typeof item === "string") {
                      const [, chunk] = item.split("#");
                      const label = chunk ? `Excerpt ${chunk}` : item;
                      return <li key={`citation-${idx}`}>{label}</li>;
                    }
                    return (
                      <li key={`${item.title || "citation"}-${idx}`}>
                        {item.url ? (
                          <a className="underline" href={item.url} target="_blank" rel="noreferrer">
                            {item.title || item.url}
                          </a>
                        ) : (
                          <span>{item.title || "Reference"}</span>
                        )}
                        {item.note ? ` — ${item.note}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const renameThread = async () => {
    if (!user || !activeThreadId) return;
    const nextTitle = window.prompt(t("ai.renamePrompt"), "");
    if (!nextTitle) return;
    setThreadBusy(true);
    try {
      const res = await fetchWithAuth(`/api/ai/threads/${activeThreadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) {
        setError(t("ai.genericError"));
        return;
      }
      await loadThreads();
    } finally {
      setThreadBusy(false);
    }
  };

  const deleteThread = async () => {
    if (!user || !activeThreadId) return;
    if (!confirm(t("ai.deleteConfirm"))) return;
    setThreadBusy(true);
    try {
      const res = await fetchWithAuth(`/api/ai/threads/${activeThreadId}`, { method: "DELETE" });
      if (!res.ok) {
        setError(t("ai.genericError"));
        return;
      }
      setActiveThreadId(null);
      setThreadMessages([]);
      setMessages([]);
      await loadThreads();
    } finally {
      setThreadBusy(false);
    }
  };

  const body = (
    <Card className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{t("ai.title")}</p>
          <p className="text-xs text-[var(--muted)]">{t("ai.subtitle")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text)]">
              {modeLabel(effectiveMode)}
            </span>
            {hintModeEnabled && (
              <span className="text-[10px] font-semibold text-[var(--muted)]">{t("ai.hintMode")}</span>
            )}
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text)]">
              {groundedMode ? t("ai.modeGrounded") : t("ai.modeGeneral")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {(["lesson", "course", "platform"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold ${
                  effectiveScope === option
                    ? "bg-[var(--accent)] text-[var(--bg)]"
                    : "bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface)]"
                }`}
                onClick={() => setSelectedScope(option)}
              >
                {option === "platform" ? t("ai.modePlatform") : option === "course" ? t("ai.modeCourse") : t("ai.modeLesson")}
              </button>
            ))}
            {effectiveScope === "lesson" && (
              <button
                type="button"
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
                onClick={() => setShowSourcesPicker(true)}
              >
                {t("ai.addSources")}
              </button>
            )}
          </div>
          {effectiveScope === "lesson" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
              {selectedSources.length === 0 ? (
                <span>{t("ai.noSourcesSelected")}</span>
              ) : (
                selectedSources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--text)]"
                    onClick={() => setSelectedSources((prev) => prev.filter((item) => item.id !== source.id))}
                  >
                    {source.title} x
                  </button>
                ))
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
            {attachments.map((file) => (
              <button
                key={file.id}
                type="button"
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--text)]"
                onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== file.id))}
              >
                {file.name} x
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
              onClick={() => fileInputRef.current?.click()}
            >
              Attach file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleAttachFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={close}>
          {t("ai.close")}
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase text-[var(--muted)]">{t("ai.recent")}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setActiveThreadId(null);
                setThreadMessages([]);
                setMessages([]);
                setNewThreadNext(true);
              }}
            >
              {t("ai.newChat")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {threads.slice(0, 10).map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold ${
                  thread.id === activeThreadId ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--card)] text-[var(--text)]"
                }`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                {thread.title || t("ai.threadTitle")}
              </button>
            ))}
            {threads.length === 0 && <span className="text-xs text-[var(--muted)]">{t("ai.noThreads")}</span>}
          </div>
          {activeThreadId && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={threadBusy} onClick={renameThread}>
                {t("ai.rename")}
              </Button>
              <Button size="sm" variant="ghost" disabled={threadBusy} onClick={deleteThread}>
                {t("ai.delete")}
              </Button>
            </div>
          )}
        </div>
        {(threadMessages.length === 0 && messages.length === 0) && (
          <p className="text-sm text-[var(--muted)]">{t("ai.empty")}</p>
        )}
        {dedupedThreadMessages.map((msg) => {
          const messageKey = msg.id;
          return (
          <div
            key={msg.id}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              msg.role === "user"
                ? "ml-auto bg-[var(--accent)] text-[var(--bg)]"
                : "mr-auto border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
            }`}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {resolveAssistantMarkdown(msg.content, msg.answerMarkdown)}
                </ReactMarkdown>
              </div>
            ) : (
              <p>{msg.content}</p>
            )}
            {msg.role === "assistant" &&
              renderDetails(messageKey, {
                sourcesLabel: msg.sourcesLabel,
                citations: msg.citations,
                confidence: msg.confidence,
                needsMoreContext: msg.needsMoreContext,
                clarifyingQuestion: msg.clarifyingQuestion,
              })}
          </div>
          );
        })}
        {(threadMessages.length === 0 && !activeThreadId) && messages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}`}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              msg.role === "user"
                ? "ml-auto bg-[var(--accent)] text-[var(--bg)]"
                : "mr-auto border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
            }`}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {resolveAssistantMarkdown(msg.text, msg.answerMarkdown)}
                </ReactMarkdown>
              </div>
            ) : (
              <p>{msg.text}</p>
            )}
            {msg.role === "assistant" &&
              renderDetails(`local-${idx}`, {
                sourcesLabel: msg.sourcesLabel,
                citations: msg.citations,
                confidence: msg.confidence,
                needsMoreContext: msg.needsMoreContext,
                clarifyingQuestion: msg.clarifyingQuestion,
              })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur">
        {remaining && (
          <p className="mb-2 text-xs text-[var(--muted)]">
            {t("ai.remaining")}: {formatRemaining(remaining)}
          </p>
        )}
        {!canAsk && <p className="mb-2 text-xs text-[var(--muted)]">{t("ai.signInRequired")}</p>}
        {error && <p className="mb-2 text-xs text-[var(--muted)]">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai.placeholder")}
            disabled={!canAsk || sending}
          />
          <Button onClick={sendMessage} disabled={!canAsk || sending || !input.trim()}>
            {sending ? t("ai.sending") : t("ai.send")}
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={close} />
          <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] p-4 sm:hidden">
            {body}
          </div>
          <div className="fixed right-6 top-24 z-40 hidden h-[70vh] w-[360px] sm:block">{body}</div>
          {showSourcesPicker && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text)]">{t("ai.addSources")}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--text)]"
                    onClick={() => setShowSourcesPicker(false)}
                  >
                    {t("ai.close")}
                  </button>
                </div>
                {availableSources.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{t("ai.noSourcesAvailable")}</p>
                ) : (
                  <div className="space-y-2">
                    {availableSources.map((source) => {
                      const checked = selectedSources.some((item) => item.id === source.id);
                      return (
                        <label key={source.id} className="flex items-center gap-2 text-sm text-[var(--text)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedSources((prev) =>
                                checked ? prev.filter((item) => item.id !== source.id) : [...prev, source],
                              )
                            }
                          />
                          <span>{source.title}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Button size="sm" onClick={() => setShowSourcesPicker(false)}>
                    {t("ai.done")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
