'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Card from "../../components/ui/card";
import Button from "../../components/ui/button";
import { RequireAuth } from "../../components/guards";
import { listEnrollments, fetchCourse, fetchLessonsForModule, fetchModules, listProgressForCourse } from "../../lib/data";
import { useAuth } from "../../lib/auth-context";
import { useI18n, pickLang } from "../../lib/i18n";
import type { Course, Enrollment, Progress, Lesson, Module } from "../../lib/types";

type EnrollmentWithCourse = Enrollment & { course?: Course | null };

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { lang, t } = useI18n();
  const [items, setItems] = useState<EnrollmentWithCourse[]>([]);
  const [nextLessonMap, setNextLessonMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (loading || !user) return;
    listEnrollments(user.uid).then(async (enrolls) => {
      const enriched: EnrollmentWithCourse[] = [];
      for (const en of enrolls) {
        enriched.push({ ...en, course: await fetchCourse(en.courseId) });
      }
      setItems(enriched);
    });
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    const loadNext = async () => {
      const mapping: Record<string, string | null> = {};
      for (const item of items) {
        if (item.status !== "active") {
          mapping[item.courseId] = null;
          continue;
        }
        const modules: Module[] = await fetchModules(item.courseId);
        const lessonsByModule: Record<string, Lesson[]> = {};
        for (const m of modules) {
          lessonsByModule[m.id] = await fetchLessonsForModule(m.id, m.courseId || item.courseId);
        }
        const progressList = await listProgressForCourse(user.uid, item.courseId);
        const progressMap: Record<string, Progress> = {};
        progressList.forEach((p) => {
          progressMap[p.lessonId] = p;
        });
        const orderedLessons: Lesson[] = [];
        modules.forEach((m) => {
          orderedLessons.push(...(lessonsByModule[m.id] || []));
        });
        const next = (orderedLessons.find((l) => progressMap[l.id]?.status !== "completed") || orderedLessons[0])?.id || null;
        mapping[item.courseId] = next;
      }
      setNextLessonMap(mapping);
    };
    loadNext();
  }, [items, user]);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-4">
          <h1 className="text-3xl font-semibold">{t("nav.myCourses")}</h1>
          <p className="text-sm text-neutral-600">{t("dashboard.subtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{item.course ? pickLang(item.course.title_kz, item.course.title_en, lang) : item.courseId}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.status === "active" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-sm text-neutral-600">{item.course ? pickLang(item.course.description_kz, item.course.description_en, lang) : ""}</p>
              <div className="flex items-center gap-2">
                <Link href={`/courses/${item.courseId}`}>
                  <Button size="sm" variant="secondary">
                    {t("home.details")}
                  </Button>
                </Link>
                {item.status === "active" ? (
                  <>
                    <Link href={`/learn/${item.courseId}`}>
                      <Button size="sm" variant="secondary">
                        {t("buttons.openCourse")}
                      </Button>
                    </Link>
                    {nextLessonMap[item.courseId] ? (
                      <Link href={`/learn/${item.courseId}/lesson/${nextLessonMap[item.courseId]}`}>
                        <Button size="sm">{t("buttons.continueLearning")}</Button>
                      </Link>
                    ) : (
                      <Link href={`/learn/${item.courseId}`}>
                        <Button size="sm">{t("buttons.startLearning")}</Button>
                      </Link>
                    )}
                  </>
                ) : (
                  <Link href={`/checkout/${item.courseId}`}>
                    <Button size="sm">{t("checkout.submitForReview")}</Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
          {items.length === 0 && <p className="text-sm text-neutral-600">{t("dashboard.empty")}</p>}
        </div>
      </div>
    </RequireAuth>
  );
}
