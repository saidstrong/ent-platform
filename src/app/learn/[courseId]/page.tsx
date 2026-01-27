'use client';

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/ui/card";
import { RequireEnrollment } from "../../../components/guards";
import { fetchCourse, fetchLessonsForModule, fetchModules, getCourseAccessState, subscribeToUserCourseProgress } from "../../../lib/data";
import { useAuth, isAdmin, isTeacher } from "../../../lib/auth-context";
import { useI18n, pickLang } from "../../../lib/i18n";
import type { Course, Lesson, Module } from "../../../lib/types";

export default function CoursePlayerPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { lang } = useI18n();
  const { user, profile, loading } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [accessState, setAccessState] = useState<"enrolled" | "pending" | "approved_waiting_enrollment" | "none">("none");
  const [lastLessonId, setLastLessonId] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [loadingOutline, setLoadingOutline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.courseId) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoadingCourse(true);
    });
    fetchCourse(params.courseId)
      .then(setCourse)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load course.");
        console.error("[learn] fetchCourse failed", { courseId: params.courseId, err });
      })
      .finally(() => {
        if (active) setLoadingCourse(false);
      });
    return () => {
      active = false;
    };
  }, [params?.courseId]);

  useEffect(() => {
    if (!params?.courseId || loading || !user) return;
    if (isAdmin(profile?.role) || isTeacher(profile?.role)) {
      Promise.resolve().then(() => setAccessState("enrolled"));
      return;
    }
    getCourseAccessState(user.uid, params.courseId)
      .then(({ state }) => setAccessState(state))
      .catch(() => setAccessState("none"));
  }, [params?.courseId, user, loading, profile?.role]);

  useEffect(() => {
    if (!params?.courseId) return;
    const canAccess = isAdmin(profile?.role) || isTeacher(profile?.role) || accessState === "enrolled";
    if (!canAccess) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoadingOutline(true);
    });
    fetchModules(params.courseId)
      .then(async (mods) => {
        setModules(mods);
        const entries: Record<string, Lesson[]> = {};
        for (const m of mods) {
          entries[m.id] = await fetchLessonsForModule(m.id, params.courseId);
        }
        setLessons(entries);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load syllabus.");
        console.error("[learn] fetchModules failed", { courseId: params.courseId, err });
      })
      .finally(() => {
        if (active) setLoadingOutline(false);
      });
    return () => {
      active = false;
    };
  }, [params?.courseId, accessState, profile?.role]);

  useEffect(() => {
    if (!user || loading || !params?.courseId) return;
    const canAccess = isAdmin(profile?.role) || isTeacher(profile?.role) || accessState === "enrolled";
    if (!canAccess) return;
    const unsub = subscribeToUserCourseProgress(user.uid, params.courseId, (progress) => {
      setCompletedLessons(progress.completedLessons || []);
    });
    return () => unsub();
  }, [user, loading, params?.courseId, accessState, profile?.role]);

  useEffect(() => {
    if (!params?.courseId) return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`lastLesson:${params.courseId}`);
    Promise.resolve().then(() => setLastLessonId(stored || null));
  }, [params?.courseId]);

  const orderedLessons = useMemo(() => {
    const orderedLessons: Lesson[] = [];
    modules.forEach((m) => {
      const ls = lessons[m.id] || [];
      orderedLessons.push(...ls);
    });
    return orderedLessons;
  }, [modules, lessons]);

  const firstLessonId = orderedLessons[0]?.id ?? null;
  const currentLessonId = lastLessonId || firstLessonId;
  const currentLessonLabel = lastLessonId ? "Resume from last lesson" : "Start from first lesson";

  const progressSummary = useMemo(() => {
    const total = orderedLessons.length;
    const completed = orderedLessons.filter((l) => completedLessons.includes(l.id)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }, [orderedLessons, completedLessons]);

  return (
    <RequireEnrollment courseId={params.courseId}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4">
          <p className="text-xs uppercase text-neutral-500">Course player</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{course ? pickLang(course.title_kz, course.title_en, lang) : "Course"}</h1>
              {course && <p className="text-sm text-neutral-600">{pickLang(course.description_kz, course.description_en, lang)}</p>}
            </div>
            <div className="text-xs text-neutral-500">
              Progress: {progressSummary.completed}/{progressSummary.total} ({progressSummary.percent}%)
            </div>
            {accessState === "enrolled" || isAdmin(profile?.role) || isTeacher(profile?.role) ? (
              currentLessonId ? (
                <button
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  onClick={() => router.push(`/learn/${params.courseId}/lesson/${currentLessonId}`)}
                >
                  Continue
                </button>
              ) : (
                <button className="rounded-md bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700" disabled>
                  Course has no lessons yet
                </button>
              )
            ) : accessState === "pending" ? (
              <button className="rounded-md bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700" disabled>
                Under review
              </button>
            ) : (
              <button
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={() => router.push(`/checkout/${params.courseId}`)}
              >
                Buy / Upload proof
              </button>
            )}
          </div>
          {(accessState === "enrolled" || isAdmin(profile?.role) || isTeacher(profile?.role)) && currentLessonId && (
            <p className="mt-2 text-xs text-neutral-500">{currentLessonLabel}</p>
          )}
        </div>
        {!user && !loading && (
          <Card className="mb-4 text-sm text-neutral-600">
            Please sign in to access this course.
          </Card>
        )}
        {loadingCourse && <p className="text-sm text-neutral-500">Loading course...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-neutral-700">Modules & lessons</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full bg-blue-600" style={{ width: `${progressSummary.percent}%` }} />
            </div>
            <div className="space-y-3">
              {modules.map((m) => (
                <div key={m.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <p className="text-sm font-semibold">{pickLang(m.title_kz, m.title_en, lang)}</p>
                  <div className="mt-2 space-y-2">
                    {(lessons[m.id] || []).map((lesson) => (
                      <div key={lesson.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm">
                        <span>{pickLang(lesson.title_kz, lesson.title_en, lang)}</span>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs font-semibold ${completedLessons.includes(lesson.id) ? "text-green-700" : "text-neutral-500"}`}
                          >
                            {completedLessons.includes(lesson.id) ? "Completed" : "Not completed"}
                          </span>
                          <Link href={`/learn/${params.courseId}/lesson/${lesson.id}`} className="text-blue-700">
                            Open
                          </Link>
                        </div>
                      </div>
                    ))}
                    {(lessons[m.id] || []).length === 0 && <p className="text-xs text-neutral-500">No lessons yet.</p>}
                  </div>
                </div>
              ))}
              {loadingOutline && <p className="text-sm text-neutral-600">Loading syllabus...</p>}
              {!loadingOutline && modules.length === 0 && <p className="text-sm text-neutral-600">Course has no lessons yet.</p>}
            </div>
          </Card>
          <Card className="flex min-h-[320px] items-center justify-center text-center text-neutral-600">
            Select a lesson on the left to start learning.
          </Card>
        </div>
      </div>
    </RequireEnrollment>
  );
}
