'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import { fetchPublishedCourses, getActiveEnrollment, getPaymentForCourse } from "../../lib/data";
import { useAuth } from "../../lib/auth-context";
import { useI18n, pickLang } from "../../lib/i18n";
import type { Course, Enrollment, Payment } from "../../lib/types";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment | null>>({});
  const [payments, setPayments] = useState<Record<string, Payment | null>>({});
  const [error, setError] = useState<string | null>(null);
  const { lang, t } = useI18n();
  const { user, loading } = useAuth();

  useEffect(() => {
    fetchPublishedCourses()
      .then(setCourses)
      .catch((err) => {
        // Friendly fallback in case rules/config still block anonymous reads.
        setError(err instanceof Error ? err.message : t("errors.loadFailed"));
        setCourses([]);
      });
  }, [t]);

  useEffect(() => {
    if (loading || !user || courses.length === 0) return;
    const load = async () => {
      const enrollmentMap: Record<string, Enrollment | null> = {};
      const paymentMap: Record<string, Payment | null> = {};
      for (const course of courses) {
        try {
          enrollmentMap[course.id] = await getActiveEnrollment(user.uid, course.id);
        } catch {
          // Treat permission errors as "no access" to keep UI stable.
          enrollmentMap[course.id] = null;
        }
        try {
          paymentMap[course.id] = await getPaymentForCourse(user.uid, course.id);
        } catch {
          // Treat permission errors as "no payment" to keep UI stable.
          paymentMap[course.id] = null;
        }
      }
      setEnrollments(enrollmentMap);
      setPayments(paymentMap);
    };
    load();
  }, [courses, user, loading]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-2">
        <p className="text-sm font-semibold text-blue-700">{t("courses.label")}</p>
        <h1 className="text-3xl font-semibold">{t("courses.title")}</h1>
        <p className="text-sm text-neutral-600">{t("courses.subtitle")}</p>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{course.tags?.join(" • ")}</span>
              <span className="text-sm text-neutral-500">
                {course.durationWeeks} {t("course.durationWeeks")}
              </span>
            </div>
            <h2 className="text-xl font-semibold">{pickLang(course.title_kz, course.title_en, lang)}</h2>
            <p className="text-sm text-neutral-600">{pickLang(course.description_kz, course.description_en, lang)}</p>
            <div className="flex items-center gap-2">
              <Link href={`/courses/${course.id}`}>
                <Button size="sm">{t("home.details")}</Button>
              </Link>
              {enrollments[course.id] ? (
                <Link href={`/learn/${course.id}`}>
                  <Button size="sm">{t("buttons.continueLearning")}</Button>
                </Link>
              ) : payments[course.id]?.status === "pending" ? (
                <Button variant="secondary" size="sm" disabled>
                  {t("course.pendingReview")}
                </Button>
              ) : payments[course.id]?.status === "approved" ? (
                <Button variant="secondary" size="sm" disabled>
                  {t("course.approvedUpdating")}
                </Button>
              ) : (
                <Link href={`/checkout/${course.id}`}>
                  <Button variant="secondary" size="sm">
                    {t("buttons.getAccess")} ({course.price} {course.currency})
                  </Button>
                </Link>
              )}
            </div>
          </Card>
        ))}
        {courses.length === 0 && <p className="text-sm text-neutral-600">{t("courses.none")}</p>}
      </div>
    </div>
  );
}
