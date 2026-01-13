'use client';

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import { useAuth, isAdmin, isTeacher } from "../../../lib/auth-context";
import { ensureEnrollment, fetchCourse, fetchLessonsForModule, fetchModules, getCourseAccessState } from "../../../lib/data";
import { useI18n, pickLang } from "../../../lib/i18n";
import type { Course, Lesson, Module } from "../../../lib/types";

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const { lang } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [accessState, setAccessState] = useState<"enrolled" | "pending" | "approved_waiting_enrollment" | "none">("none");
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    if (!params?.courseId) return;
    fetchCourse(params.courseId)
      .then(setCourse)
      .catch((err) => console.error("[course] fetchCourse failed", { courseId: params.courseId, err }));
  }, [params?.courseId]);

  useEffect(() => {
    if (loading || !user || !params?.courseId) return;
    setCheckingAccess(true);
    getCourseAccessState(user.uid, params.courseId)
      .then(({ state }) => setAccessState(state))
      .catch(() => setAccessState("none"))
      .finally(() => setCheckingAccess(false));
  }, [user, loading, params?.courseId]);

  useEffect(() => {
    if (accessState !== "approved_waiting_enrollment") return;
    if (!user || !params?.courseId) return;
    const timer = setTimeout(() => {
      ensureEnrollment(user.uid, params.courseId).catch(() => null);
      getCourseAccessState(user.uid, params.courseId)
        .then(({ state }) => setAccessState(state))
        .catch(() => setAccessState("none"));
    }, 2500);
    return () => clearTimeout(timer);
  }, [accessState, user, params?.courseId]);

  const canReadContent = useMemo(
    () => isAdmin(profile?.role) || isTeacher(profile?.role) || accessState === "enrolled",
    [profile?.role, accessState],
  );
  const hasRoleAccess = useMemo(() => isAdmin(profile?.role) || isTeacher(profile?.role), [profile?.role]);

  useEffect(() => {
    if (!params?.courseId) return;
    if (!canReadContent) return;
    fetchModules(params.courseId)
      .then(async (mods) => {
        setModules(mods);
        const lessonEntries: Record<string, Lesson[]> = {};
        for (const m of mods) {
          lessonEntries[m.id] = await fetchLessonsForModule(m.id, params.courseId);
        }
        setLessons(lessonEntries);
      })
      .catch((err) => console.error("[course] fetchModules failed", { courseId: params.courseId, err }));
  }, [params?.courseId, canReadContent]);

  if (!course) return <p className="px-4 py-10 text-sm text-neutral-600">Loading course...</p>;

  const firstLessonId = useMemo(() => {
    const orderedLessons: Lesson[] = [];
    modules.forEach((m) => {
      const ls = lessons[m.id] || [];
      orderedLessons.push(...ls);
    });
    return orderedLessons[0]?.id;
  }, [modules, lessons]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-blue-700">{course.tags?.join(" • ")}</p>
            <h1 className="text-3xl font-semibold">{pickLang(course.title_kz, course.title_en, lang)}</h1>
            <p className="max-w-3xl text-sm text-neutral-600">{pickLang(course.description_kz, course.description_en, lang)}</p>
            <p className="text-sm text-neutral-600">
              Level: {course.level} · Duration: {course.durationWeeks} weeks
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4 text-right text-blue-900">
            <p className="text-sm font-semibold">Price</p>
            <p className="text-3xl font-bold">
              {course.price} {course.currency}
            </p>
            {accessState === "enrolled" || hasRoleAccess ? (
              <Link href={firstLessonId ? `/learn/${course.id}/lesson/${firstLessonId}` : `/learn/${course.id}`}>
                <Button className="mt-3" fullWidth>
                  Continue learning
                </Button>
              </Link>
            ) : accessState === "pending" ? (
              <Button className="mt-3" fullWidth disabled>
                Under review
              </Button>
            ) : accessState === "approved_waiting_enrollment" ? (
              <Button className="mt-3" fullWidth disabled>
                Approved, updating access...
              </Button>
            ) : (
              <Button
                className="mt-3"
                fullWidth
                disabled={checkingAccess}
                onClick={() => router.push(user ? `/checkout/${course.id}` : "/login")}
              >
                {checkingAccess ? "Checking..." : "Buy course"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Program</h2>
        <div className="space-y-4">
          {modules.map((mod) => (
            <div key={mod.id} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{pickLang(mod.title_kz, mod.title_en, lang)}</h3>
                <span className="text-xs uppercase text-neutral-500">Module {mod.order}</span>
              </div>
              <div className="mt-2 space-y-1">
                {(lessons[mod.id] || []).map((lesson) => (
                  <div key={lesson.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                    <span>{pickLang(lesson.title_kz, lesson.title_en, lang)}</span>
                    {accessState === "enrolled" || hasRoleAccess ? (
                      <Link className="text-blue-700" href={`/learn/${course.id}/lesson/${lesson.id}`}>
                        Open
                      </Link>
                    ) : (
                      <span className="text-xs text-neutral-500">Locked</span>
                    )}
                  </div>
                ))}
                {(lessons[mod.id] || []).length === 0 && <p className="text-sm text-neutral-500">No lessons yet.</p>}
              </div>
            </div>
          ))}
          {modules.length === 0 && <p className="text-sm text-neutral-600">Modules will appear once an admin creates them.</p>}
        </div>
      </Card>
    </div>
  );
}
