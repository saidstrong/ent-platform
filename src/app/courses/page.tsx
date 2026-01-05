'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import { fetchPublishedCourses } from "../../lib/data";
import { useI18n, pickLang } from "../../lib/i18n";
import type { Course } from "../../lib/types";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const { lang } = useI18n();

  useEffect(() => {
    fetchPublishedCourses().then(setCourses).catch(console.error);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-2">
        <p className="text-sm font-semibold text-blue-700">Courses</p>
        <h1 className="text-3xl font-semibold">Published catalog</h1>
        <p className="text-sm text-neutral-600">Browse available cohorts and request access.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{course.tags?.join(" • ")}</span>
              <span className="text-sm text-neutral-500">{course.durationWeeks} weeks</span>
            </div>
            <h2 className="text-xl font-semibold">{pickLang(course.title_kz, course.title_en, lang)}</h2>
            <p className="text-sm text-neutral-600">{pickLang(course.description_kz, course.description_en, lang)}</p>
            <div className="flex items-center gap-2">
              <Link href={`/courses/${course.id}`}>
                <Button size="sm">Details</Button>
              </Link>
              <Link href={`/checkout/${course.id}`}>
                <Button variant="secondary" size="sm">
                  Buy access ({course.price} {course.currency})
                </Button>
              </Link>
            </div>
          </Card>
        ))}
        {courses.length === 0 && <p className="text-sm text-neutral-600">No courses yet. Admin can create a published course.</p>}
      </div>
    </div>
  );
}
