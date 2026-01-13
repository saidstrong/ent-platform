'use client';

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/ui/card";
import { RequireEnrollment } from "../../../components/guards";
import { fetchCourse, fetchLessonsForModule, fetchModules, getActiveEnrollment, subscribeToUserCourseProgress } from "../../../lib/data";
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
  const [hasEnrollmentAccess, setHasEnrollmentAccess] = useState(false);

  useEffect(() => {
    if (!params?.courseId) return;
    fetchCourse(params.courseId)
      .then(setCourse)
      .catch((err) => console.error("[learn] fetchCourse failed", { courseId: params.courseId, err }));
  }, [params?.courseId]);

  useEffect(() => {
    if (!params?.courseId || loading || !user) return;
    if (!isAdmin(profile?.role) && !isTeacher(profile?.role)) {
      getActiveEnrollment(user.uid, params.courseId)
        .then((en) => setHasEnrollmentAccess(!!en))
        .catch(() => setHasEnrollmentAccess(false));
      return;
    }
    setHasEnrollmentAccess(true);
  }, [params?.courseId, user, loading, profile?.role]);

  useEffect(() => {
    if (!params?.courseId) return;
    if (loading || !user) return;
    if (!hasEnrollmentAccess) return;
    fetchModules(params.courseId)
      .then(async (mods) => {
        setModules(mods);
        const entries: Record<string, Lesson[]> = {};
        for (const m of mods) {
          entries[m.id] = await fetchLessonsForModule(m.id, params.courseId);
        }
        setLessons(entries);
      })
      .catch((err) => console.error("[learn] fetchModules failed", { courseId: params.courseId, err }));
  }, [params?.courseId, user, loading, hasEnrollmentAccess]);

  useEffect(() => {
    if (!user || loading || !params?.courseId) return;
    if (!hasEnrollmentAccess) return;
    const unsub = subscribeToUserCourseProgress(user.uid, params.courseId, (progress) => {
      setCompletedLessons(progress.completedLessons || []);
    });
    return () => unsub();
  }, [user, loading, params?.courseId, hasEnrollmentAccess]);

  const nextLessonId = useMemo(() => {
    const orderedLessons: Lesson[] = [];
    modules.forEach((m) => {
      const ls = lessons[m.id] || [];
      orderedLessons.push(...ls);
    });
    const incomplete = orderedLessons.find((l) => !completedLessons.includes(l.id));
    return (incomplete || orderedLessons[0])?.id;
  }, [modules, lessons, completedLessons]);

  const progressSummary = useMemo(() => {
    const orderedLessons: Lesson[] = [];
    modules.forEach((m) => {
      const ls = lessons[m.id] || [];
      orderedLessons.push(...ls);
    });
    const total = orderedLessons.length;
    const completed = orderedLessons.filter((l) => completedLessons.includes(l.id)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }, [modules, lessons, completedLessons]);

  return (
    <RequireEnrollment courseId={params.courseId}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4">
          <p className="text-xs uppercase text-neutral-500">Course player</p>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">{course ? pickLang(course.title_kz, course.title_en, lang) : "Course"}</h1>
            <div className="text-xs text-neutral-500">
              Progress: {progressSummary.completed}/{progressSummary.total} ({progressSummary.percent}%)
            </div>
            {nextLessonId && (
              <button
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={() => router.push(`/learn/${params.courseId}/lesson/${nextLessonId}`)}
              >
                Continue
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-neutral-700">Modules & lessons</p>
            <div className="space-y-3">
              {modules.map((m) => (
                <div key={m.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <p className="text-sm font-semibold">{pickLang(m.title_kz, m.title_en, lang)}</p>
                  <div className="mt-2 space-y-2">
                    {(lessons[m.id] || []).map((lesson) => (
                      <Link
                        key={lesson.id}
                        href={`/learn/${params.courseId}/lesson/${lesson.id}`}
                        className="block rounded-md bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm transition hover:bg-blue-50"
                      >
                        <div className="flex items-center justify-between">
                          <span>{pickLang(lesson.title_kz, lesson.title_en, lang)}</span>
                          <span
                            className={`text-xs font-semibold ${completedLessons.includes(lesson.id) ? "text-green-700" : "text-neutral-500"}`}
                          >
                            {completedLessons.includes(lesson.id) ? "Completed" : "Not completed"}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {(lessons[m.id] || []).length === 0 && <p className="text-xs text-neutral-500">No lessons yet.</p>}
                  </div>
                </div>
              ))}
              {modules.length === 0 && <p className="text-sm text-neutral-600">Modules coming soon.</p>}
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
