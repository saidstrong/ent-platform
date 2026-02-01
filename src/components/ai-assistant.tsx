'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Button from "./ui/button";
import Textarea from "./ui/textarea";
import Card from "./ui/card";
import { useAuth } from "../lib/auth-context";
import { useI18n } from "../lib/i18n";

type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  sources?: SourceEntry[] | string[];
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
  type: "pdf" | "course";
  title: string;
  docId?: string;
  pages?: number[] | { from: number; to: number };
  excerptIds?: number[];
  snippet?: string;
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
  const [policyInfo, setPolicyInfo] = useState<{ mode?: string; policyApplied?: ThreadMessage["policyApplied"] } | null>(
    null,
  );
  const threadsLoadingRef = useRef(false);
  const threadLoadingRef = useRef(false);
  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canAsk = !!user && !loading;

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
    if (params?.courseId) qs.set("courseId", String(params.courseId));
    if (params?.lessonId) qs.set("lessonId", String(params.lessonId));
    try {
      const res = await fetchWithAuth(`/api/ai/threads?${qs.toString()}`);
      const payload = await res.json().catch(() => ({}));
      if (res.ok && !payload?.ok) {
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
  }, [user, params?.courseId, params?.lessonId, activeThreadId, fetchWithAuth, t]);

  const loadThread = useCallback(
    async (threadId: string) => {
      if (!user || threadLoadingRef.current) return;
      threadLoadingRef.current = true;
      try {
        const res = await fetchWithAuth(`/api/ai/threads/${threadId}`);
        const payload = await res.json().catch(() => ({}));
        if (res.ok && !payload?.ok) {
          const msgs = payload.messages || [];
          setThreadMessages(msgs);
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
    const clientRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setInput("");
    if (activeThreadId) {
      upsertThreadMessage({ id: `u_${clientRequestId}`, role: "user", content: question });
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
          courseId: params?.courseId ?? null,
          lessonId: params?.lessonId ?? null,
          threadId: activeThreadId,
          newThread: newThreadNext,
          path: pathname,
          clientRequestId,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(t("ai.quotaExceeded"));
        }
        throw new Error(payload?.error || t("ai.genericError"));
      }
      const answerText = typeof payload?.answer === "string" ? payload.answer : payload.replyText;
      if (activeThreadId) {
        upsertThreadMessage({
          id: `a_${clientRequestId}`,
          role: "assistant",
          content: answerText,
          sources: payload.sources,
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
    citations?: string[],
    messageKey?: string,
    answerText?: string,
    citationMeta?: ThreadMessage["citationMeta"],
  ) => {
    if ((!sources || sources.length === 0) && (!citations || citations.length === 0) && !citationMeta?.length) {
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
    const referencesCount = citations?.length || 0;
    const formatCitationLabel = (id: string) => {
      const [resourceId, chunkRaw] = id.split("#");
      const name = nameByResource.get(resourceId) || "PDF";
      const numeric = Number(chunkRaw);
      const display = Number.isFinite(numeric) ? String(numeric) : chunkRaw ?? "";
      return `${name} — excerpt ${display}`.trim();
    };

    return (
      <div className="mt-2 space-y-2 text-[11px] text-neutral-500">
        {summaryParts.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t("ai.sources")}:</span>
            <span>{summaryParts.join("; ")}</span>
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
        {showCitations && citations?.length ? (
          <div className="flex flex-wrap items-center gap-1">
            {citations.map((id) => (
              <span
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => openCitation(id, messageKey)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    openCitation(id, messageKey);
                  }
                }}
                className="rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[10px] text-neutral-700 hover:bg-neutral-300"
              >
                {formatCitationLabel(id)}
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
          </div>
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
            <p>{msg.content}</p>
            {msg.role === "assistant" && renderMeta(msg.sources, msg.citations, messageKey, msg.content, msg.citationMeta)}
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
            <p>{msg.text}</p>
            {msg.role === "assistant" &&
              renderMeta(msg.sources, msg.citations, `local-${idx}`, msg.text, msg.citationMeta)}
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
        </>
      )}
    </>
  );
};
