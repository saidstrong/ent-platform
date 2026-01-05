'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Card from "../../../components/ui/card";
import { RequireEnrollment } from "../../../components/guards";
import { fetchCourse, fetchLessonsForModule, fetchModules } from "../../../lib/data";
import { useI18n, pickLang } from "../../../lib/i18n";
import type { Course, Lesson, Module } from "../../../lib/types";

export default function CoursePlayerPage() {
  const params = useParams<{ courseId: string }>();
  const { lang } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});

  useEffect(() => {
    if (!params?.courseId) return;
    fetchCourse(params.courseId).then(setCourse);
    fetchModules(params.courseId).then(async (mods) => {
      setModules(mods);
      const entries: Record<string, Lesson[]> = {};
      for (const m of mods) {
        entries[m.id] = await fetchLessonsForModule(m.id);
      }
      setLessons(entries);
    });
  }, [params?.courseId]);

  return (
    <RequireEnrollment courseId={params.courseId}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4">
          <p className="text-xs uppercase text-neutral-500">Course player</p>
          <h1 className="text-2xl font-semibold">{course ? pickLang(course.title_kz, course.title_en, lang) : "Course"}</h1>
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
                        {pickLang(lesson.title_kz, lesson.title_en, lang)}
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
