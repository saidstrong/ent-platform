'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Button from "./ui/button";
import Textarea from "./ui/textarea";
import Card from "./ui/card";
import { useAuth } from "../lib/auth-context";
import { useI18n } from "../lib/i18n";
import { fetchLesson } from "../lib/data";

type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  sources?: SourceEntry[] | string[];
  sourcesSummary?: string;
  references?: ReferenceEntry[];
  citations?: string[];
  citationMeta?: Array<{ resourceId: string; name: string; excerpts?: number[] }>;
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
  sources?: SourceEntry[] | string[];
  sourcesSummary?: string;
  references?: ReferenceEntry[];
  citations?: string[];
  citationMeta?: Array<{ resourceId: string; name: string; excerpts?: number[] }>;
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

type CitationPreview = {
  id: string;
  name?: string;
  snippet?: string;
  pageLabel?: string;
  loading?: boolean;
  error?: string;
  messageKey: string;
};

type SourceEntry = {
  type: "pdf" | "course" | "youtube";
  title: string;
  docId?: string;
  pages?: number[] | { from: number; to: number };
  excerptIds?: number[];
  snippet?: string;
};

type ReferenceEntry = {
  type: "pdf" | "course" | "youtube";
  title: string;
  label: string;
  excerptIndex?: number;
  page?: number;
  snippet?: string;
};

type SourceOption = {
  id: string;
  type: "pdf" | "youtube";
  title: string;
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
  const [citationPreview, setCitationPreview] = useState<CitationPreview | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const [availableSources, setAvailableSources] = useState<SourceOption[]>([]);
  const [selectedSources, setSelectedSources] = useState<SourceOption[]>([]);
  const [showSourcesPicker, setShowSourcesPicker] = useState(false);
  const [selectedScope, setSelectedScope] = useState<"lesson" | "course" | "platform" | null>(null);
  const [policyInfo, setPolicyInfo] = useState<{ mode?: string; policyApplied?: ThreadMessage["policyApplied"] } | null>(
    null,
  );
  const threadsLoadingRef = useRef(false);
  const threadLoadingRef = useRef(false);
  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
          const msgs = payload.messages || [];
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
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(t("ai.quotaExceeded"));
        }
        throw new Error(payload?.error || t("ai.genericError"));
      }
      const answerText =
        typeof payload?.answerMarkdown === "string"
          ? payload.answerMarkdown
          : typeof payload?.answer === "string"
            ? payload.answer
            : payload.replyText;
      if (activeThreadId) {
        upsertThreadMessage({
          id: `a_${clientRequestId}`,
          role: "assistant",
          content: answerText,
          createdAt: localCreatedAt,
          sources: payload.sources,
          sourcesSummary: payload.sourcesSummary,
          references: payload.references,
          citations: payload.citations,
          citationMeta: payload.citationMeta,
          mode: payload.mode,
          policyApplied: payload.policyApplied,
        });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: answerText,
            sources: payload.sources,
            sourcesSummary: payload.sourcesSummary,
            references: payload.references,
            citations: payload.citations,
            citationMeta: payload.citationMeta,
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

  const renderMeta = (
    sources?: SourceEntry[] | string[],
    sourcesSummary?: string,
    references?: ReferenceEntry[],
    citations?: string[],
    messageKey?: string,
    answerText?: string,
    citationMeta?: ThreadMessage["citationMeta"],
  ) => {
    if (
      (!sources || sources.length === 0) &&
      (!citations || citations.length === 0) &&
      !citationMeta?.length &&
      !sourcesSummary
    ) {
      return null;
    }

    const normalizeSources = () => {
      const normalized: SourceEntry[] = [];
      if (Array.isArray(sources) && sources.length > 0) {
        if (typeof sources[0] === "string") {
          (sources as string[]).forEach((entry) => {
            if (!entry) return;
            if (entry.toLowerCase().includes("course metadata")) {
              normalized.push({ type: "course", title: "Course metadata" });
              return;
            }
            const match = entry.match(/^(.*)\s+excerpts:\s*(.+)$/i);
            if (match) {
              const excerptIds = match[2]
                .split(",")
                .map((value) => Number(value.trim()))
                .filter((value) => Number.isFinite(value));
              normalized.push({ type: "pdf", title: match[1].trim(), excerptIds });
              return;
            }
            normalized.push({ type: "pdf", title: entry.trim() });
          });
        } else {
          (sources as SourceEntry[]).forEach((entry) => {
            if (entry?.type) {
              normalized.push(entry);
              return;
            }
            normalized.push({
              type: "pdf",
              title: entry?.title || "PDF",
              docId: entry?.docId,
              pages: entry?.pages,
              excerptIds: entry?.excerptIds,
              snippet: entry?.snippet,
            });
          });
        }
      }
      if (normalized.length === 0 && citationMeta?.length) {
        citationMeta.forEach((meta) => {
          normalized.push({
            type: "pdf",
            title: meta.name,
            docId: meta.resourceId,
            excerptIds: meta.excerpts,
          });
        });
      }
      return normalized;
    };

    const normalizedSources = normalizeSources();
    const nameByResource = new Map<string, string>();
    normalizedSources.forEach((entry) => {
      if (entry.docId && entry.title) {
        nameByResource.set(entry.docId, entry.title);
      }
    });
    (citationMeta || []).forEach((meta) => {
      if (meta?.resourceId && meta?.name) {
        nameByResource.set(meta.resourceId, meta.name);
      }
    });

    const formatPages = (pages?: SourceEntry["pages"]) => {
      if (!pages) return "";
      if (Array.isArray(pages)) {
        const unique = Array.from(new Set(pages)).sort((a, b) => a - b);
        return unique.join(", ");
      }
      return pages.from && pages.to ? `${pages.from}–${pages.to}` : "";
    };

    const summaryParts = normalizedSources.map((entry) => {
      if (entry.type === "course") return entry.title || "Course metadata";
      const excerptIds = entry.excerptIds ? [...new Set(entry.excerptIds)].sort((a, b) => a - b) : [];
      const pages = formatPages(entry.pages);
      if (pages && excerptIds.length) {
        return `${entry.title} pages: ${pages} (excerpts: ${excerptIds.join(", ")})`;
      }
      if (pages) {
        return `${entry.title} pages: ${pages}`;
      }
      if (excerptIds.length) {
        return `${entry.title} excerpts: ${excerptIds.join(", ")}`;
      }
      return entry.title;
    });

    const showCitations = messageKey ? !!expandedCitations[messageKey] : false;
    const fallbackRefs =
      references && references.length
        ? references.map((ref) => `${ref.title} — ${ref.label}`)
        : (citations || []).map((id) => {
            const [resourceId, chunkRaw] = id.split("#");
            const name = nameByResource.get(resourceId) || "PDF";
            const numeric = Number(chunkRaw);
            const display = Number.isFinite(numeric) ? String(numeric) : chunkRaw ?? "";
            return `${name} — excerpt ${display}`.trim();
          });
    const referencesCount = fallbackRefs.length;
    const summaryText = sourcesSummary?.trim()
      ? sourcesSummary.trim()
      : summaryParts.length
        ? `${t("ai.sources")}: ${summaryParts.join("; ")}`
        : "";
    const formatCitationLabel = (id: string) => {
      const [resourceId, chunkRaw] = id.split("#");
      const name = nameByResource.get(resourceId) || "PDF";
      const numeric = Number(chunkRaw);
      const display = Number.isFinite(numeric) ? String(numeric) : chunkRaw ?? "";
      return `${name} — excerpt ${display}`.trim();
    };

    return (
      <div className="mt-2 space-y-2 text-[11px] text-neutral-500">
        {summaryText ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{summaryText}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {answerText ? (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
              onClick={() => {
                if (typeof navigator === "undefined" || !navigator.clipboard) return;
                navigator.clipboard.writeText(answerText).catch(() => null);
              }}
            >
              {t("ai.copyAnswer")}
            </button>
          ) : null}
          {referencesCount > 0 ? (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
              onClick={() => {
                if (!messageKey) return;
                setExpandedCitations((prev) => ({ ...prev, [messageKey]: !prev[messageKey] }));
              }}
            >
              {showCitations ? t("ai.hideCitations") : `${t("ai.showCitations")} (${referencesCount})`}
            </button>
          ) : null}
        </div>
        {showCitations && referencesCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {fallbackRefs.map((label) => (
              <span
                key={label}
                className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-700"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const openCitation = async (citationId: string, messageKey?: string) => {
    if (!user) return;
    const ownerKey = messageKey || citationId;
    setCitationPreview({ id: citationId, loading: true, messageKey: ownerKey });
    try {
      const res = await fetchWithAuth(`/api/ai/citations/${encodeURIComponent(citationId)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setCitationPreview({
          id: citationId,
          error: t("ai.genericError"),
          messageKey: ownerKey,
        });
        return;
      }
      const formatPages = (pages?: SourceEntry["pages"]) => {
        if (!pages) return "";
        if (Array.isArray(pages)) {
          const unique = Array.from(new Set(pages)).sort((a, b) => a - b);
          return unique.join(", ");
        }
        return pages.from && pages.to ? `${pages.from}–${pages.to}` : "";
      };
      const findMessageByKey = () => {
        const threadMatch = dedupedThreadMessages.find((msg) => msg.id === ownerKey);
        if (threadMatch) return threadMatch;
        return messages.find((msg, index) => `local-${index}` === ownerKey);
      };
      let pageLabel = "";
      const message = findMessageByKey();
      if (message && Array.isArray(message.sources) && message.sources.length > 0 && typeof message.sources[0] !== "string") {
        const [resourceId] = citationId.split("#");
        const entry = (message.sources as SourceEntry[]).find(
          (source) => source.type === "pdf" && source.docId === resourceId,
        );
        const pages = entry ? formatPages(entry.pages) : "";
        if (pages) {
          pageLabel = `Pages: ${pages}`;
        }
      }
      setCitationPreview({
        id: citationId,
        name: payload?.name,
        snippet: payload?.snippet,
        pageLabel,
        messageKey: ownerKey,
      });
    } catch {
      setCitationPreview({ id: citationId, error: t("ai.genericError"), messageKey: ownerKey });
    }
  };

  const formatExcerptLabel = (citationId?: string) => {
    if (!citationId) return "";
    const [, raw] = citationId.split("#");
    const index = Number(raw);
    if (Number.isFinite(index)) return `Excerpt ${index}`;
    return citationId;
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
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-neutral-800">{t("ai.title")}</p>
          <p className="text-xs text-neutral-500">{t("ai.subtitle")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
              {modeLabel(effectiveMode)}
            </span>
            {hintModeEnabled && (
              <span className="text-[10px] font-semibold text-amber-600">{t("ai.hintMode")}</span>
            )}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
              {groundedMode ? t("ai.modeGrounded") : t("ai.modeGeneral")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {(["lesson", "course", "platform"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  effectiveScope === option
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
                onClick={() => setSelectedScope(option)}
              >
                {option === "platform" ? t("ai.modePlatform") : option === "course" ? t("ai.modeCourse") : t("ai.modeLesson")}
              </button>
            ))}
            {effectiveScope === "lesson" && (
              <button
                type="button"
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-200"
                onClick={() => setShowSourcesPicker(true)}
              >
                {t("ai.addSources")}
              </button>
            )}
          </div>
          {effectiveScope === "lesson" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
              {selectedSources.length === 0 ? (
                <span>{t("ai.noSourcesSelected")}</span>
              ) : (
                selectedSources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700"
                    onClick={() => setSelectedSources((prev) => prev.filter((item) => item.id !== source.id))}
                  >
                    {source.title} ×
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={close}>
          {t("ai.close")}
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase text-neutral-500">{t("ai.recent")}</p>
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
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  thread.id === activeThreadId ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-700"
                }`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                {thread.title || t("ai.threadTitle")}
              </button>
            ))}
            {threads.length === 0 && <span className="text-xs text-neutral-500">{t("ai.noThreads")}</span>}
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
          <p className="text-sm text-neutral-600">{t("ai.empty")}</p>
        )}
        {dedupedThreadMessages.map((msg) => {
          const messageKey = msg.id;
          const showPreview =
            citationPreview &&
            citationPreview.messageKey === messageKey &&
            msg.citations?.includes(citationPreview.id);
          return (
          <div
            key={msg.id}
            className={`rounded-xl px-3 py-2 text-sm ${
              msg.role === "user" ? "ml-auto bg-blue-600 text-white" : "mr-auto bg-neutral-100 text-neutral-700"
            }`}
          >
            {msg.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            ) : (
              <p>{msg.content}</p>
            )}
            {msg.role === "assistant" &&
              renderMeta(
                msg.sources,
                msg.sourcesSummary,
                msg.references,
                msg.citations,
                messageKey,
                msg.content,
                msg.citationMeta,
              )}
            {msg.role === "assistant" && showPreview && (
              <div className="mt-2 hidden rounded-lg border border-neutral-200 bg-white p-2 text-[11px] text-neutral-700 sm:block">
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-neutral-500">
                  <span>{citationPreview.name || "PDF"}</span>
                  <button type="button" className="text-blue-600" onClick={() => setCitationPreview(null)}>
                    {t("ai.close")}
                  </button>
                </div>
                {citationPreview.loading && <div>{t("ai.sending")}</div>}
                {citationPreview.error && <div className="text-red-600">{citationPreview.error}</div>}
                {citationPreview.snippet && <div>{citationPreview.snippet}</div>}
                {citationPreview.pageLabel && (
                  <div className="text-[10px] text-neutral-500">{citationPreview.pageLabel}</div>
                )}
                {citationPreview.id && (
                  <div className="mt-1 text-[10px] text-neutral-400">{formatExcerptLabel(citationPreview.id)}</div>
                )}
              </div>
            )}
          </div>
          );
        })}
        {(threadMessages.length === 0 && !activeThreadId) && messages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}`}
            className={`rounded-xl px-3 py-2 text-sm ${
              msg.role === "user" ? "ml-auto bg-blue-600 text-white" : "mr-auto bg-neutral-100 text-neutral-700"
            }`}
          >
            {msg.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
            ) : (
              <p>{msg.text}</p>
            )}
            {msg.role === "assistant" &&
              renderMeta(
                msg.sources,
                msg.sourcesSummary,
                msg.references,
                msg.citations,
                `local-${idx}`,
                msg.text,
                msg.citationMeta,
              )}
            {msg.role === "assistant" &&
              citationPreview &&
              citationPreview.messageKey === `local-${idx}` &&
              msg.citations?.includes(citationPreview.id) && (
                <div className="mt-2 hidden rounded-lg border border-neutral-200 bg-white p-2 text-[11px] text-neutral-700 sm:block">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-neutral-500">
                    <span>{citationPreview.name || "PDF"}</span>
                    <button type="button" className="text-blue-600" onClick={() => setCitationPreview(null)}>
                      {t("ai.close")}
                    </button>
                  </div>
                  {citationPreview.loading && <div>{t("ai.sending")}</div>}
                  {citationPreview.error && <div className="text-red-600">{citationPreview.error}</div>}
                  {citationPreview.snippet && <div>{citationPreview.snippet}</div>}
                  {citationPreview.pageLabel && (
                    <div className="text-[10px] text-neutral-500">{citationPreview.pageLabel}</div>
                  )}
                  {citationPreview.id && (
                    <div className="mt-1 text-[10px] text-neutral-400">
                      {formatExcerptLabel(citationPreview.id)}
                    </div>
                  )}
                </div>
              )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {citationPreview && (
        <>
          <div className="fixed inset-0 z-[55] bg-black/30 sm:hidden" onClick={() => setCitationPreview(null)} />
          <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl bg-white p-4 shadow-lg sm:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-600">{citationPreview.name || "PDF"}</span>
              <button type="button" className="text-sm font-semibold text-blue-600" onClick={() => setCitationPreview(null)}>
                {t("ai.close")}
              </button>
            </div>
            {citationPreview.loading && <p className="text-xs text-neutral-500">{t("ai.sending")}</p>}
            {citationPreview.error && <p className="text-xs text-red-600">{citationPreview.error}</p>}
            {citationPreview.snippet && <p className="text-sm text-neutral-700">{citationPreview.snippet}</p>}
            {citationPreview.pageLabel && (
              <p className="text-[11px] text-neutral-500">{citationPreview.pageLabel}</p>
            )}
            {citationPreview.id && (
              <p className="mt-2 text-[10px] text-neutral-400">{formatExcerptLabel(citationPreview.id)}</p>
            )}
          </div>
        </>
      )}
      <div className="border-t border-neutral-200 px-4 py-3">
        {remaining && (
          <p className="mb-2 text-xs text-neutral-500">
            {t("ai.remaining")}: {formatRemaining(remaining)}
          </p>
        )}
        {!canAsk && <p className="mb-2 text-xs text-neutral-500">{t("ai.signInRequired")}</p>}
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
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
          <div className="fixed inset-0 z-50 flex flex-col bg-white p-4 sm:hidden">
            {body}
          </div>
          <div className="fixed right-6 top-24 z-40 hidden h-[70vh] w-[360px] sm:block">{body}</div>
          {showSourcesPicker && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{t("ai.addSources")}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-blue-600"
                    onClick={() => setShowSourcesPicker(false)}
                  >
                    {t("ai.close")}
                  </button>
                </div>
                {availableSources.length === 0 ? (
                  <p className="text-sm text-neutral-600">{t("ai.noSourcesAvailable")}</p>
                ) : (
                  <div className="space-y-2">
                    {availableSources.map((source) => {
                      const checked = selectedSources.some((item) => item.id === source.id);
                      return (
                        <label key={source.id} className="flex items-center gap-2 text-sm text-neutral-700">
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
