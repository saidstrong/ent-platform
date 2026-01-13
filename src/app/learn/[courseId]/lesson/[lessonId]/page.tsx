'use client';

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Card from "../../../../../components/ui/card";
import Button from "../../../../../components/ui/button";
import { RequireEnrollment } from "../../../../../components/guards";
import {
  fetchCourse,
  fetchLesson,
  getEnrollment,
  getAssignmentByLesson,
  getUserCourseProgress,
  markLessonCompleted,
  unmarkLessonCompleted,
  markLessonOpened,
  subscribeToUserSubmission,
} from "../../../../../lib/data";
import { useAuth, isAdmin, isTeacher } from "../../../../../lib/auth-context";
import { useI18n, pickLang } from "../../../../../lib/i18n";
import { formatAnyTimestamp } from "../../../../../lib/utils";
import type { Assignment, Course, Lesson, Submission } from "../../../../../lib/types";

export default function LessonPage() {
  const params = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const { lang } = useI18n();
  const { user, profile, loading } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [savingComplete, setSavingComplete] = useState(false);
  const [hasEnrollmentAccess, setHasEnrollmentAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (!params?.courseId) return;
    fetchCourse(params.courseId)
      .then(setCourse)
      .catch((err) => console.error("[lesson] fetchCourse failed", { courseId: params.courseId, err }));
  }, [params?.courseId]);

  useEffect(() => {
    if (loading || !user || !params?.courseId) return;
    if (!isAdmin(profile?.role) && !isTeacher(profile?.role)) {
      getEnrollment(user.uid, params.courseId)
        .then(({ hasAccess }) => setHasEnrollmentAccess(hasAccess))
        .catch(() => setHasEnrollmentAccess(false))
        .finally(() => setCheckingAccess(false));
      return;
    }
    setHasEnrollmentAccess(true);
    setCheckingAccess(false);
  }, [user, loading, profile?.role, params?.courseId]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    const canAccess = isPrivileged || hasEnrollmentAccess;
    if (!params?.lessonId) return;
    if (!canAccess) return;
    fetchLesson(params.lessonId)
      .then(setLesson)
      .catch((err) => console.error("[lesson] fetchLesson failed", { lessonId: params.lessonId, err }));
    getAssignmentByLesson(params.lessonId, params.courseId)
      .then(setAssignment)
      .catch((err) => console.error("[lesson] getAssignmentByLesson failed", { lessonId: params.lessonId, err }));
  }, [params?.lessonId, params?.courseId, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    const canAccess = isPrivileged || hasEnrollmentAccess;
    if (!assignment?.id || !user || !canAccess) {
      return;
    }
    try {
      const unsub = subscribeToUserSubmission(assignment.id, user.uid, setSubmission);
      return () => unsub();
    } catch (err) {
      console.error("[lesson] subscribeToUserSubmission failed", { assignmentId: assignment.id, uid: user.uid, err });
    }
  }, [assignment?.id, user, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    const canAccess = isPrivileged || hasEnrollmentAccess;
    if (!user || !params.lessonId || !params.courseId || !canAccess) return;
    markLessonOpened(user.uid, params.courseId, params.lessonId).catch((err) =>
      console.error("[lesson] markLessonOpened failed", { uid: user.uid, courseId: params.courseId, lessonId: params.lessonId, err }),
    );
    getUserCourseProgress(user.uid, params.courseId)
      .then((progress) => setCompletedLessons(progress.completedLessons || []))
      .catch((err) => console.error("[lesson] getUserCourseProgress failed", { uid: user.uid, courseId: params.courseId, err }));
  }, [user, params.lessonId, params.courseId, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    if (!course || checkingAccess) return;
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    if (isPrivileged) return;
    if (course.price > 0 && !hasEnrollmentAccess) {
      router.push(`/checkout/${params.courseId}`);
    }
  }, [course, checkingAccess, hasEnrollmentAccess, profile?.role, params.courseId, router]);

  const filenameFromUrl = (url?: string | null) => {
    if (!url) return "";
    try {
      const parts = url.split("/");
      return decodeURIComponent(parts[parts.length - 1] || "");
    } catch {
      return url;
    }
  };

  const markCompleted = async () => {
    if (!user || !params.courseId || !params.lessonId) return;
    const wasCompleted = completedLessons.includes(params.lessonId);
    setCompletedLessons((prev) => (prev.includes(params.lessonId) ? prev : [...prev, params.lessonId]));
    setSavingComplete(true);
    try {
      await markLessonCompleted(user.uid, params.courseId, params.lessonId);
    } catch (err) {
      if (!wasCompleted) {
        setCompletedLessons((prev) => prev.filter((id) => id !== params.lessonId));
      }
      console.error("[lesson] markLessonCompleted failed", { uid: user.uid, courseId: params.courseId, lessonId: params.lessonId, err });
    } finally {
      setSavingComplete(false);
    }
  };

  const unmarkCompleted = async () => {
    if (!user || !params.courseId || !params.lessonId) return;
    const wasCompleted = completedLessons.includes(params.lessonId);
    setCompletedLessons((prev) => prev.filter((id) => id !== params.lessonId));
    setSavingComplete(true);
    try {
      await unmarkLessonCompleted(user.uid, params.courseId, params.lessonId);
    } catch (err) {
      if (wasCompleted) {
        setCompletedLessons((prev) => (prev.includes(params.lessonId) ? prev : [...prev, params.lessonId]));
      }
      console.error("[lesson] unmarkLessonCompleted failed", { uid: user.uid, courseId: params.courseId, lessonId: params.lessonId, err });
    } finally {
      setSavingComplete(false);
    }
  };

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
                {submission && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Your submission</p>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          submission.checkedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {submission.checkedAt ? "Checked" : "Pending review"}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-neutral-700">
                      <p>Submitted: {formatAnyTimestamp(submission.submittedAt)}</p>
                      {submission.grade !== null && submission.grade !== undefined && (
                        <p className="text-base font-semibold">Grade: {submission.grade}</p>
                      )}
                      {submission.feedback && (
                        <div className="rounded-md bg-white p-2 text-sm">
                          <p className="text-[12px] font-semibold uppercase text-neutral-500">Feedback</p>
                          <p>{submission.feedback}</p>
                        </div>
                      )}
                      {submission.checkedAt && <p className="text-xs text-neutral-500">Checked at: {formatAnyTimestamp(submission.checkedAt)}</p>}
                      {submission.fileUrl && (
                        <div className="space-y-1">
                          <p className="text-[12px] font-semibold uppercase text-neutral-500">Attachment</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-neutral-600">{submission.fileName || filenameFromUrl(submission.fileUrl)}</span>
                            <a className="text-blue-700" href={submission.fileUrl} target="_blank" rel="noreferrer">
                              Open
                            </a>
                            <a className="text-blue-700" href={submission.fileUrl} target="_blank" rel="noreferrer" download>
                              Download
                            </a>
                          </div>
                          {((submission.contentType && submission.contentType.startsWith("image/")) ||
                            submission.fileUrl.endsWith(".jpg") ||
                            submission.fileUrl.endsWith(".jpeg") ||
                            submission.fileUrl.endsWith(".png") ||
                            submission.fileUrl.endsWith(".webp")) && (
                            // lightweight preview; intentionally not using next/image to keep the preview simple
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={submission.fileUrl} alt="Submission attachment" className="max-h-40 rounded-md object-contain" />
                          )}
                          {(submission.contentType === "application/pdf" || submission.fileUrl.endsWith(".pdf")) && (
                            <a className="text-blue-700" href={submission.fileUrl} target="_blank" rel="noreferrer">
                              Open PDF
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <Link href={`/assignment/${assignment.id}`}>
                  <Button fullWidth>Submit homework</Button>
                </Link>
              </Card>
            ) : (
              <Card className="text-sm text-neutral-600">No assignment attached.</Card>
            )}
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-neutral-500">Progress</p>
                  <p className="text-sm text-neutral-700">{completedLessons.includes(params.lessonId) ? "Completed" : "In progress"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    completedLessons.includes(params.lessonId) ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {completedLessons.includes(params.lessonId) ? "Completed" : "In progress"}
                </span>
              </div>
              {completedLessons.includes(params.lessonId) ? (
                <Button onClick={unmarkCompleted} disabled={savingComplete} fullWidth>
                  {savingComplete ? "Saving..." : "Completed (undo)"}
                </Button>
              ) : (
                <Button onClick={markCompleted} disabled={savingComplete} fullWidth>
                  {savingComplete ? "Saving..." : "Mark as completed"}
                </Button>
              )}
            </Card>
          </div>
        </div>
      </div>
    </RequireEnrollment>
  );
}
