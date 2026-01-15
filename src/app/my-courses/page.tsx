'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import { RequireAuth } from "../../components/guards";
import { useAuth } from "../../lib/auth-context";
import { fetchLesson, getCourseAccessState, getFirstLessonId, listMyCourses } from "../../lib/data";
import type { Course } from "../../lib/types";

export default function MyCoursesPage() {
  const { user, loading } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [continueMap, setContinueMap] = useState<Record<string, { lessonId: string | null; label: string }>>({});
  const [accessMap, setAccessMap] = useState<Record<string, "enrolled" | "pending" | "approved_waiting_enrollment" | "none">>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    listMyCourses(user.uid)
      .then(setCourses)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load courses."));
  }, [user, loading]);

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
          let label = "Start learning";
          if (state === "enrolled") {
            if (typeof window !== "undefined") {
              const stored = window.localStorage.getItem(`lastLesson:${course.id}`);
              if (stored) {
                try {
                  const lesson = await fetchLesson(stored);
                  if (lesson && (!lesson.courseId || lesson.courseId === course.id)) {
                    lessonId = stored;
                    label = "Resume from last lesson";
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
                label = "Start from first lesson";
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
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load course progress."));
    return () => {
      active = false;
    };
  }, [courses, user, loading]);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <p className="text-xs uppercase text-neutral-500">My courses</p>
          <h1 className="text-2xl font-semibold">Your enrollments</h1>
        </div>
        {loading && <p className="text-sm text-neutral-600">Loading your courses...</p>}
        {!loading && error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Card key={course.id} className="space-y-2">
              <h2 className="text-lg font-semibold">{course.title_en}</h2>
              <p className="text-sm text-neutral-600">{course.description_en}</p>
              {accessMap[course.id] === "pending" ? (
                <Button size="sm" disabled>
                  Under review
                </Button>
              ) : accessMap[course.id] === "approved_waiting_enrollment" ? (
                <Button size="sm" disabled>
                  Approved, updating access...
                </Button>
              ) : accessMap[course.id] === "enrolled" ? (
                continueMap[course.id]?.lessonId ? (
                  <Link href={`/learn/${course.id}/lesson/${continueMap[course.id]?.lessonId}`}>
                    <Button size="sm">Continue</Button>
                  </Link>
                ) : (
                  <Link href={`/learn/${course.id}`}>
                    <Button size="sm">Open course</Button>
                  </Link>
                )
              ) : (
                <Link href={`/checkout/${course.id}`}>
                  <Button size="sm">Buy / Upload proof</Button>
                </Link>
              )}
              {accessMap[course.id] === "enrolled" && (
                continueMap[course.id]?.lessonId ? (
                  <p className="text-xs text-neutral-500">{continueMap[course.id]?.label ?? "Start learning"}</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-500">Course has no lessons yet.</p>
                    <Link href={`/learn/${course.id}`}>
                      <Button size="sm" variant="secondary">
                        Open course
                      </Button>
                    </Link>
                  </div>
                )
              )}
            </Card>
          ))}
          {courses.length === 0 && !loading && <p className="text-sm text-neutral-600">No courses yet.</p>}
        </div>
      </div>
    </RequireAuth>
  );
}
