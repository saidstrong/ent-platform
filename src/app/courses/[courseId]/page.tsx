'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import { useAuth } from "../../../lib/auth-context";
import { fetchCourse, fetchLessonsForModule, fetchModules, getActiveEnrollment } from "../../../lib/data";
import { useI18n, pickLang } from "../../../lib/i18n";
import type { Course, Enrollment, Lesson, Module } from "../../../lib/types";

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const { user } = useAuth();
  const { lang } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  useEffect(() => {
    if (!params?.courseId) return;
    fetchCourse(params.courseId).then(setCourse);
    fetchModules(params.courseId).then(async (mods) => {
      setModules(mods);
      const lessonEntries: Record<string, Lesson[]> = {};
      for (const m of mods) {
        lessonEntries[m.id] = await fetchLessonsForModule(m.id);
      }
      setLessons(lessonEntries);
    });
  }, [params?.courseId]);

  useEffect(() => {
    if (user && params?.courseId) {
      getActiveEnrollment(user.uid, params.courseId).then(setEnrollment);
    }
  }, [user, params?.courseId]);

  if (!course) return <p className="px-4 py-10 text-sm text-neutral-600">Loading course...</p>;

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
            {enrollment ? (
              <Link href={`/learn/${course.id}`}>
                <Button className="mt-3" fullWidth>
                  Continue learning
                </Button>
              </Link>
            ) : (
              <Link href={`/checkout/${course.id}`}>
                <Button className="mt-3" fullWidth>
                  Buy access
                </Button>
              </Link>
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
                    {enrollment ? (
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
