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
    if (!user) return { href: "/signup", label: t("signup") };
    if (isAdmin(profile?.role)) return { href: "/admin", label: t("admin") };
    if (isTeacher(profile?.role)) return { href: "/teacher", label: "Teacher" };
    return { href: "/my-courses", label: t("myCourses") };
  }, [user, profile?.role, t]);

  useEffect(() => {
    fetchPublishedCourses().then(setCourses).catch(console.error);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white px-6 py-10 shadow-sm md:px-12 md:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#e0f2fe,transparent_35%),radial-gradient(circle_at_80%_0%,#dbeafe,transparent_30%)]" />
        <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
          <div className="space-y-5">
            <Badge>8-week ENT • Math & Physics</Badge>
            <h1 className="text-4xl font-semibold leading-tight md:text-5xl">{t("landingTitle")}</h1>
            <p className="max-w-2xl text-lg text-neutral-700">{t("landingSubtitle")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/courses">
                <Button>{t("browseCourses")}</Button>
              </Link>
              {!loading && (
                <Link href={primaryCta.href}>
                  <Button variant="secondary">{primaryCta.label}</Button>
                </Link>
              )}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-inner">
              <p className="text-sm font-semibold text-blue-800">Cohort MVP</p>
              <ul className="mt-3 space-y-2 text-sm text-blue-900">
                <li>• Manual Kaspi payment with admin confirmation</li>
                <li>• Homework submissions with feedback</li>
                <li>• Active enrollment gate for lesson content</li>
                <li>• Bilingual UI (KZ/EN) toggle</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Published courses</h2>
          <Link href="/courses" className="text-sm font-semibold text-blue-700">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Badge>{course.tags?.slice(0, 3).join(" • ") || "ENT"}</Badge>
                <span className="text-sm text-neutral-500">{course.durationWeeks} weeks</span>
              </div>
              <h3 className="text-xl font-semibold">
                {pickLang(course.title_kz, course.title_en, lang)} · {course.price} {course.currency}
              </h3>
              <p className="text-sm text-neutral-600">
                {pickLang(course.description_kz, course.description_en, lang)?.slice(0, 160) ?? ""}
              </p>
              <div className="flex items-center gap-2">
                <Link href={`/courses/${course.id}`}>
                  <Button size="sm">Details</Button>
                </Link>
                {user ? (
                  <Link href={`/my-courses`}>
                    <Button variant="secondary" size="sm">
                      {t("myCourses")}
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/checkout/${course.id}`}>
                    <Button variant="secondary" size="sm">
                      {t("buyAccess")}
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
          {courses.length === 0 && <p className="text-sm text-neutral-600">No published courses yet. Add one in admin.</p>}
        </div>
      </section>
    </div>
  );
}
