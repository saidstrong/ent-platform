'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import Card from "../components/ui/card";
import { fetchPublishedCourses } from "../lib/data";
import { useAuth, isAdmin, isTeacher } from "../lib/auth-context";
import { useI18n, pickLang } from "../lib/i18n";
import type { Course } from "../lib/types";

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  const { t, lang } = useI18n();
  const { user, profile, loading } = useAuth();

  const primaryCta = useMemo(() => {
    if (!user) return { href: "/signup", label: t("nav.signup") };
    if (isAdmin(profile?.role)) return { href: "/admin", label: t("nav.admin") };
    if (isTeacher(profile?.role)) return { href: "/teacher", label: t("nav.teacher") };
    return { href: "/my-courses", label: t("nav.myCourses") };
  }, [user, profile?.role, t]);

  useEffect(() => {
    fetchPublishedCourses().then(setCourses).catch(console.error);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] px-6 py-10 shadow-sm md:px-12 md:py-16">
        <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
          <div className="space-y-5">
            <Badge>{t("home.welcomeBadge")}</Badge>
            <h1 className="text-4xl font-semibold leading-tight md:text-5xl">{t("home.heroTitle")}</h1>
            <p className="max-w-2xl text-lg text-[var(--muted)]">{t("home.heroSubtitle")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/courses">
                <Button>{t("buttons.browseCourses")}</Button>
              </Link>
              {!loading && (
                <Link href={primaryCta.href}>
                  <Button variant="secondary">{primaryCta.label}</Button>
                </Link>
              )}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <p className="text-sm font-semibold text-[var(--text)]">{t("home.cohortTitle")}</p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                <li>• {t("home.cohortItems.manualPayment")}</li>
                <li>• {t("home.cohortItems.homework")}</li>
                <li>• {t("home.cohortItems.enrollmentGate")}</li>
                <li>• {t("home.cohortItems.bilingual")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">{t("home.publishedTitle")}</h2>
          <Link href="/courses" className="text-sm font-semibold text-[var(--text)]">
            {t("home.viewAll")}
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Badge>{course.tags?.slice(0, 3).join(" • ") || "ENT"}</Badge>
                <span className="text-sm text-[var(--muted)]">
                  {course.durationWeeks} {t("home.weeksLabel")}
                </span>
              </div>
              <h3 className="text-xl font-semibold">
                {pickLang(course.title_kz, course.title_en, lang)} · {course.price} {course.currency}
              </h3>
              <p className="text-sm text-[var(--muted)]">
                {pickLang(course.description_kz, course.description_en, lang)?.slice(0, 160) ?? ""}
              </p>
              <div className="flex items-center gap-2">
                <Link href={`/courses/${course.id}`}>
                  <Button size="sm">{t("home.details")}</Button>
                </Link>
                {user ? (
                  <Link href={`/my-courses`}>
                    <Button variant="secondary" size="sm">
                      {t("nav.myCourses")}
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/checkout/${course.id}`}>
                    <Button variant="secondary" size="sm">
                      {t("buttons.getAccess")}
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
          {courses.length === 0 && <p className="text-sm text-[var(--muted)]">{t("home.noCourses")}</p>}
        </div>
      </section>
    </div>
  );
}
