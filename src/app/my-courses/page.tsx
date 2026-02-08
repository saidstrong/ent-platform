'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import { RequireAuth } from "../../components/guards";
import { useAuth } from "../../lib/auth-context";
import { fetchLesson, getCourseAccessState, getFirstLessonId, listMyCourses } from "../../lib/data";
import { useI18n, pickLang } from "../../lib/i18n";
import type { Course } from "../../lib/types";

export default function MyCoursesPage() {
  const { user, loading } = useAuth();
  const { lang, t } = useI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [continueMap, setContinueMap] = useState<Record<string, { lessonId: string | null; label: string }>>({});
  const [accessMap, setAccessMap] = useState<Record<string, "enrolled" | "pending" | "approved_waiting_enrollment" | "none">>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    listMyCourses(user.uid)
      .then(setCourses)
      .catch((err) => setError(err instanceof Error ? err.message : t("errors.loadFailed")));
  }, [user, loading, t]);

  useEffect(() => {
    if (loading || !user || courses.length === 0) return;
    let active = true;
    const load = async () => {
      const entries = await Promise.all(
        courses.map(async (course) => {
          let state: "enrolled" | "pending" | "approved_waiting_enrollment" | "none" = "none";
          try {
            const access = await getCourseAccessState(user.uid, course.id);
            state = access.state;
          } catch {
            state = "none";
          }
          let lessonId: string | null = null;
          let label = t("course.startFromFirst");
          if (state === "enrolled") {
            if (typeof window !== "undefined") {
              const stored = window.localStorage.getItem(`lastLesson:${course.id}`);
              if (stored) {
                try {
                  const lesson = await fetchLesson(stored);
                  if (lesson && (!lesson.courseId || lesson.courseId === course.id)) {
                    lessonId = stored;
                    label = t("course.resumeFromLast");
                  }
                } catch {
                  lessonId = null;
                }
              }
            }
            if (!lessonId) {
              const first = await getFirstLessonId(course.id);
              if (first) {
                lessonId = first;
                label = t("course.startFromFirst");
              }
            }
          }
          return { courseId: course.id, state, lessonId, label };
        }),
      );
      if (!active) return;
      const nextContinue: Record<string, { lessonId: string | null; label: string }> = {};
      const nextAccess: Record<string, "enrolled" | "pending" | "approved_waiting_enrollment" | "none"> = {};
      entries.forEach((entry) => {
        nextContinue[entry.courseId] = { lessonId: entry.lessonId, label: entry.label };
        nextAccess[entry.courseId] = entry.state;
      });
      setContinueMap(nextContinue);
      setAccessMap(nextAccess);
    };
    load().catch((err) => setError(err instanceof Error ? err.message : t("errors.loadFailed")));
    return () => {
      active = false;
    };
  }, [courses, user, loading, t]);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <p className="text-xs uppercase text-[var(--muted)]">{t("nav.myCourses")}</p>
          <h1 className="text-2xl font-semibold">{t("myCourses.title")}</h1>
        </div>
        {loading && <p className="text-sm text-[var(--muted)]">{t("auth.loading")}</p>}
        {!loading && error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Card key={course.id} className="space-y-2">
              <h2 className="text-lg font-semibold">{pickLang(course.title_kz, course.title_en, lang)}</h2>
              <p className="text-sm text-[var(--muted)]">{pickLang(course.description_kz, course.description_en, lang)}</p>
              {accessMap[course.id] === "pending" ? (
                <Button size="sm" disabled>
                  {t("course.pendingReview")}
                </Button>
              ) : accessMap[course.id] === "approved_waiting_enrollment" ? (
                <Button size="sm" disabled>
                  {t("course.approvedUpdating")}
                </Button>
              ) : accessMap[course.id] === "enrolled" ? (
                continueMap[course.id]?.lessonId ? (
                  <Link href={`/learn/${course.id}/lesson/${continueMap[course.id]?.lessonId}`}>
                    <Button size="sm">{t("buttons.continueLearning")}</Button>
                  </Link>
                ) : (
                  <Link href={`/learn/${course.id}`}>
                    <Button size="sm">{t("buttons.openCourse")}</Button>
                  </Link>
                )
              ) : (
                <Link href={`/checkout/${course.id}`}>
                  <Button size="sm">{t("buttons.getAccess")}</Button>
                </Link>
              )}
              {accessMap[course.id] === "enrolled" && (
                continueMap[course.id]?.lessonId ? (
                  <p className="text-xs text-[var(--muted)]">{continueMap[course.id]?.label ?? t("course.startFromFirst")}</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-[var(--muted)]">{t("course.noLessons")}</p>
                    <Link href={`/learn/${course.id}`}>
                      <Button size="sm" variant="secondary">
                        {t("buttons.openCourse")}
                      </Button>
                    </Link>
                  </div>
                )
              )}
            </Card>
          ))}
          {courses.length === 0 && !loading && <p className="text-sm text-[var(--muted)]">{t("courses.none")}</p>}
        </div>
      </div>
    </RequireAuth>
  );
}
