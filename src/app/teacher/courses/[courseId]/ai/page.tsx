'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Card from "../../../../../components/ui/card";
import Button from "../../../../../components/ui/button";
import Input from "../../../../../components/ui/input";
import Select from "../../../../../components/ui/select";
import { useAuth, isAdmin, isTeacher } from "../../../../../lib/auth-context";
import { pickLang, useI18n } from "../../../../../lib/i18n";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../../../lib/firebase";

type AnalyticsResponse = {
  ok: boolean;
  courseId: string;
  lessonId?: string | null;
  scope?: "course" | "lesson";
  days: number;
  totals: { totalRequests: number };
  byMode: Record<string, number>;
  byOutcome: Record<string, number>;
  unsupportedRate: number;
  topQuestions: Array<{
    qHash: string;
    exampleTruncated: string;
    count: number;
    lastSeenAt: string | null;
  }>;
};

export default function TeacherAiAnalyticsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user, profile, loading } = useAuth();
  const { t, lang } = useI18n();
  const canAccess = useMemo(() => isAdmin(profile?.role) || isTeacher(profile?.role), [profile?.role]);
  const [days, setDays] = useState(14);
  const [lessonId, setLessonId] = useState("");
  const [lessons, setLessons] = useState<Array<{ id: string; title: string; order?: number; moduleId?: string }>>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const fetchAnalytics = async (override?: { lessonId?: string; days?: number }) => {
    if (!user || !courseId) return;
    setLoadingData(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const lessonFilter = override?.lessonId ?? lessonId;
      const daysValue = override?.days ?? days;
      const qs = new URLSearchParams({
        courseId: String(courseId),
        days: String(daysValue),
      });
      if (lessonFilter) qs.set("lessonId", lessonFilter.trim());
      const res = await fetch(`/api/teacher/ai-analytics?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.ok === false) {
        if (payload?.code === "firestore_missing_index") {
          setError(t("aiAnalytics.indexBuilding"));
        } else {
          setError(t("aiAnalytics.loadFailed"));
        }
      } else {
        setData(payload as AnalyticsResponse);
      }
    } catch {
      setError(t("aiAnalytics.loadFailed"));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!loading && user && canAccess) {
      fetchAnalytics();
    }
  }, [loading, user, canAccess]);

  useEffect(() => {
    const loadLessons = async () => {
      if (!user || !courseId || !canAccess) return;
      setLessonsLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "lessons"), where("courseId", "==", String(courseId))));
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            title_kz?: string;
            title_en?: string;
            order?: number;
            moduleId?: string;
          };
          return {
            id: docSnap.id,
            title: pickLang(data.title_kz, data.title_en, lang) ?? data.title_en ?? data.title_kz ?? docSnap.id,
            order: data.order,
            moduleId: data.moduleId,
          };
        });
        next.sort((a, b) => {
          if (a.moduleId && b.moduleId && a.moduleId !== b.moduleId) return a.moduleId.localeCompare(b.moduleId);
          const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.title.localeCompare(b.title);
        });
        setLessons(next);
      } catch {
        setLessons([]);
      } finally {
        setLessonsLoading(false);
      }
    };
    if (!loading && user && canAccess) {
      loadLessons();
    }
  }, [loading, user, canAccess, courseId, lang]);

  if (loading) {
    return <p className="px-4 py-6 text-sm text-[var(--muted)]">{t("aiAnalytics.loading")}</p>;
  }

  if (!user || !canAccess) {
    return (
      <Card className="m-4">
        <p className="text-sm text-[var(--muted)]">{t("aiAnalytics.accessDenied")}</p>
        <Link href="/teacher" className="mt-2 inline-block text-sm text-[var(--text)]">
          {t("aiAnalytics.back")}
        </Link>
      </Card>
    );
  }

  const total = data?.totals?.totalRequests || 0;
  const unsupportedRate = data?.unsupportedRate ?? 0;
  const scopeLabel = data?.scope === "lesson" ? t("aiAnalytics.scopeLesson") : t("aiAnalytics.scopeCourse");

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-[var(--muted)]">{t("teacher.submissions")}</p>
          <h1 className="text-2xl font-semibold">{t("aiAnalytics.title")}</h1>
          <p className="text-xs text-[var(--muted)]">{t("aiAnalytics.subtitle")}</p>
          <p className="text-xs text-[var(--muted)]">{scopeLabel}</p>
        </div>
        <Link href="/teacher" className="text-sm text-[var(--text)]">
          {t("aiAnalytics.back")}
        </Link>
      </div>

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-[var(--muted)]">{t("aiAnalytics.days")}</label>
            <Input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Number(e.target.value || 14))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-[var(--muted)]">{t("aiAnalytics.lessonLabel")}</label>
            <Select
              value={lessonId}
              onChange={(e) => {
                const next = e.target.value;
                setLessonId(next);
                fetchAnalytics({ lessonId: next });
              }}
            >
              <option value="">{t("aiAnalytics.allLessons")}</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </Select>
            {!lessonsLoading && lessons.length === 0 && (
              <p className="text-xs text-[var(--muted)]">{t("aiAnalytics.noLessonsFound")}</p>
            )}
          </div>
          <div className="flex items-end">
            <Button onClick={() => void fetchAnalytics()} disabled={loadingData}>
              {loadingData ? t("aiAnalytics.loading") : t("aiAnalytics.refresh")}
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-[var(--muted)]">{t("aiAnalytics.totalRequests")}</p>
          <p className="text-2xl font-semibold">{total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-[var(--muted)]">{t("aiAnalytics.unsupportedRate")}</p>
          <p className="text-2xl font-semibold">{unsupportedRate}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-[var(--muted)]">{t("aiAnalytics.days")}</p>
          <p className="text-2xl font-semibold">{data?.days || days}</p>
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-[var(--text)]">{t("aiAnalytics.byOutcome")}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          {data?.byOutcome
            ? Object.entries(data.byOutcome).map(([key, value]) => (
                <span key={key} className="rounded-full bg-[var(--surface)] px-3 py-1">
                  {key}: {value}
                </span>
              ))
            : <span className="text-[var(--muted)]">{t("aiAnalytics.noData")}</span>}
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-[var(--text)]">{t("aiAnalytics.byMode")}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          {data?.byMode
            ? Object.entries(data.byMode).map(([key, value]) => (
                <span key={key} className="rounded-full bg-[var(--surface)] px-3 py-1">
                  {key}: {value}
                </span>
              ))
            : <span className="text-[var(--muted)]">{t("aiAnalytics.noData")}</span>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-3 gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--muted)]">
          <span>{t("aiAnalytics.question")}</span>
          <span>{t("aiAnalytics.count")}</span>
          <span>{t("aiAnalytics.lastSeen")}</span>
        </div>
        <div className="divide-y divide-neutral-100">
          {data?.topQuestions?.map((q) => (
            <div key={q.qHash} className="grid grid-cols-3 gap-2 px-4 py-3 text-sm">
              <span className="text-[var(--text)]">{q.exampleTruncated || q.qHash}</span>
              <span className="text-[var(--muted)]">{q.count}</span>
              <span className="text-[var(--muted)]">{q.lastSeenAt ? new Date(q.lastSeenAt).toLocaleString() : "-"}</span>
            </div>
          ))}
          {(data?.topQuestions?.length ?? 0) === 0 && (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">{t("aiAnalytics.noData")}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
