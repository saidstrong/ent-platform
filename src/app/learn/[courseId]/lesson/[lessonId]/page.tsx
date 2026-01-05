'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Card from "../../../../../components/ui/card";
import Button from "../../../../../components/ui/button";
import { RequireEnrollment } from "../../../../../components/guards";
import { fetchCourse, fetchLesson, getAssignmentByLesson } from "../../../../../lib/data";
import { useI18n, pickLang } from "../../../../../lib/i18n";
import type { Assignment, Course, Lesson } from "../../../../../lib/types";

export default function LessonPage() {
  const params = useParams<{ courseId: string; lessonId: string }>();
  const { lang } = useI18n();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);

  useEffect(() => {
    if (!params?.lessonId) return;
    fetchLesson(params.lessonId).then(setLesson);
    if (params.courseId) {
      fetchCourse(params.courseId).then(setCourse);
    }
    getAssignmentByLesson(params.lessonId).then(setAssignment);
  }, [params?.courseId, params?.lessonId]);

  return (
    <RequireEnrollment courseId={params.courseId}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4">
          <Link href={`/learn/${params.courseId}`} className="text-sm text-blue-700">
            ← Back to course
          </Link>
          <h1 className="text-3xl font-semibold">{lesson ? pickLang(lesson.title_kz, lesson.title_en, lang) : "Lesson"}</h1>
          {course && <p className="text-sm text-neutral-600">{pickLang(course.title_kz, course.title_en, lang)}</p>}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <Card className="space-y-4">
            {lesson?.type === "video" && lesson.videoUrl && (
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-neutral-100">
                <iframe className="h-full w-full" src={lesson.videoUrl} title={lesson.title_en} allowFullScreen />
              </div>
            )}
            {(lesson?.content_en || lesson?.content_kz) && (
              <div className="prose max-w-none">
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: pickLang(lesson.content_kz, lesson.content_en, lang) || "" }}
                />
              </div>
            )}
            {lesson?.attachments && lesson.attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Attachments</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-blue-700">
                  {lesson.attachments.map((file) => (
                    <li key={file.url}>
                      <a href={file.url} target="_blank" rel="noreferrer">
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <div className="space-y-4">
            {assignment ? (
              <Card className="space-y-3">
                <div>
                  <p className="text-xs uppercase text-neutral-500">Assignment</p>
                  <h2 className="text-lg font-semibold">{pickLang(assignment.title_kz, assignment.title_en, lang)}</h2>
                </div>
                <p className="text-sm text-neutral-600">{pickLang(assignment.instructions_kz, assignment.instructions_en, lang)}</p>
                <Link href={`/assignment/${assignment.id}`}>
                  <Button fullWidth>Submit homework</Button>
                </Link>
              </Card>
            ) : (
              <Card className="text-sm text-neutral-600">No assignment attached.</Card>
            )}
          </div>
        </div>
      </div>
    </RequireEnrollment>
  );
}
