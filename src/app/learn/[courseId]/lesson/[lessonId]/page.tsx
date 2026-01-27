'use client';

export const dynamic = "force-dynamic";

import Link from "next/link";
import dynamicImport from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Card from "../../../../../components/ui/card";
import Button from "../../../../../components/ui/button";
import Input from "../../../../../components/ui/input";
import Select from "../../../../../components/ui/select";
import FilePreview from "../../../../../components/file-preview";
import { RequireEnrollment } from "../../../../../components/guards";
import {
  fetchCourse,
  fetchLesson,
  getEnrollment,
  getAssignmentByLesson,
  subscribeToUserCourseProgress,
  fetchModules,
  fetchLessonsForModule,
  fetchMyQuizAttempt,
  fetchQuiz,
  submitQuizAttempt,
  markLessonCompleted,
  unmarkLessonCompleted,
  markLessonOpened,
} from "../../../../../lib/data";
import { useAuth, isAdmin, isTeacher } from "../../../../../lib/auth-context";
import { useI18n, pickLang } from "../../../../../lib/i18n";
import type {
  Assignment,
  Course,
  Lesson,
  LessonResource,
  Module,
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizQuestion,
} from "../../../../../lib/types";

const PdfViewer = dynamicImport(() => import("../../../../../components/pdf-viewer"), { ssr: false });

export default function LessonPage() {
  const params = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const { lang } = useI18n();
  const { user, profile, loading } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, Lesson[]>>({});
  const [savingComplete, setSavingComplete] = useState(false);
  const [hasEnrollmentAccess, setHasEnrollmentAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizAttempt, setQuizAttempt] = useState<QuizAttempt | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, QuizAnswer>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[route] learn lesson mounted", { courseId: params.courseId, lessonId: params.lessonId });
    }
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
        .catch((err) => {
          setHasEnrollmentAccess(false);
          if (process.env.NODE_ENV !== "production") {
            console.warn("[learn] access denied", { courseId: params.courseId, lessonId: params.lessonId, reason: err });
          }
        })
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
    setLoadingLesson(true);
    fetchLesson(params.lessonId)
      .then(setLesson)
      .catch((err) => console.error("[lesson] fetchLesson failed", { lessonId: params.lessonId, err }))
      .finally(() => setLoadingLesson(false));
    getAssignmentByLesson(params.lessonId, params.courseId)
      .then(setAssignment)
      .catch((err) => console.error("[lesson] getAssignmentByLesson failed", { lessonId: params.lessonId, err }));
  }, [params?.lessonId, params?.courseId, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    const canAccess = isPrivileged || hasEnrollmentAccess;
    if (!lesson || lesson.type !== "quiz" || !canAccess || !user) {
      setQuiz(null);
      setQuizAttempt(null);
      setQuizAnswers({});
      return;
    }
    let active = true;
    fetchQuiz(lesson.id)
      .then((nextQuiz) => {
        if (!active) return;
        setQuizError(null);
        setQuiz(nextQuiz);
        if (nextQuiz) {
          setQuizAnswers((prev) => (Object.keys(prev).length ? prev : {}));
        }
      })
      .catch((err) => {
        if (!active) return;
        setQuizError(err instanceof Error ? err.message : "Failed to load quiz.");
      });
    fetchMyQuizAttempt(user.uid, lesson.id)
      .then((attempt) => {
        if (!active) return;
        setQuizAttempt(attempt);
        if (attempt?.answers) {
          setQuizAnswers(attempt.answers);
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [lesson, user, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    const canAccess = isPrivileged || hasEnrollmentAccess;
    if (!user || !params.lessonId || !params.courseId || !canAccess) return;
    markLessonOpened(user.uid, params.courseId, params.lessonId).catch((err) =>
      console.error("[lesson] markLessonOpened failed", { uid: user.uid, courseId: params.courseId, lessonId: params.lessonId, err }),
    );
    const unsub = subscribeToUserCourseProgress(user.uid, params.courseId, (progress) => {
      setCompletedLessons(progress.completedLessons || []);
    });
    return () => unsub();
  }, [user, params.lessonId, params.courseId, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    const canAccess = isPrivileged || hasEnrollmentAccess;
    if (!params?.courseId || !canAccess) return;
    fetchModules(params.courseId)
      .then(async (mods) => {
        setModules(mods);
        const entries: Record<string, Lesson[]> = {};
        for (const mod of mods) {
          entries[mod.id] = await fetchLessonsForModule(mod.id, params.courseId);
        }
        setLessonsByModule(entries);
      })
      .catch((err) => console.error("[lesson] fetchModules failed", { courseId: params.courseId, err }));
  }, [params?.courseId, hasEnrollmentAccess, profile?.role]);

  useEffect(() => {
    if (!course || checkingAccess) return;
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    if (isPrivileged) return;
    if (course.price > 0 && !hasEnrollmentAccess) {
      router.push(`/checkout/${params.courseId}`);
    }
  }, [course, checkingAccess, hasEnrollmentAccess, profile?.role, params.courseId, router]);

  useEffect(() => {
    const isPrivileged = isAdmin(profile?.role) || isTeacher(profile?.role);
    if (!lesson?.id || !params?.courseId || !params?.lessonId) return;
    if (!hasEnrollmentAccess && !isPrivileged) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`lastLesson:${params.courseId}`, params.lessonId);
  }, [lesson?.id, params?.courseId, params?.lessonId, hasEnrollmentAccess, profile?.role]);

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

  const orderedLessonIds = useMemo(() => {
    const ordered: string[] = [];
    modules.forEach((mod) => {
      const ls = lessonsByModule[mod.id] || [];
      ls.forEach((l) => ordered.push(l.id));
    });
    return ordered;
  }, [modules, lessonsByModule]);

  const currentIndex = orderedLessonIds.indexOf(params.lessonId);
  const prevLessonId = currentIndex > 0 ? orderedLessonIds[currentIndex - 1] : null;
  const nextLessonId = currentIndex >= 0 && currentIndex < orderedLessonIds.length - 1 ? orderedLessonIds[currentIndex + 1] : null;
  const canAccessContent = isAdmin(profile?.role) || isTeacher(profile?.role) || hasEnrollmentAccess;

  const getYouTubeEmbedUrl = (url: string | undefined | null) => {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname.includes("youtu.be")) {
        const id = parsed.pathname.replace("/", "");
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      if (parsed.hostname.includes("youtube.com")) {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
    } catch {
      return null;
    }
    return null;
  };

  const isPdfUrl = (url?: string | null) => {
    if (!url) return false;
    try {
      const clean = url.split("?")[0]?.toLowerCase();
      return clean.endsWith(".pdf");
    } catch {
      return false;
    }
  };

  const renderResource = (resource: LessonResource) => {
    const linkUrl = resource.downloadUrl || resource.url;
    if (resource.kind === "note") {
      return (
        <details className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{resource.name}</summary>
          <p className="mt-2 whitespace-pre-wrap text-neutral-700">{resource.text}</p>
        </details>
      );
    }
    if (resource.kind === "file" && linkUrl) {
      if (resource.contentType?.includes("pdf") || isPdfUrl(linkUrl)) {
        return <PdfViewer url={linkUrl} title={resource.name} />;
      }
      return <FilePreview url={linkUrl} filename={resource.name} contentType={resource.contentType} />;
    }
    const embedUrl = getYouTubeEmbedUrl(linkUrl);
    if (resource.kind === "youtube" || embedUrl) {
      if (embedUrl) {
        return (
          <div className="space-y-2">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-neutral-100">
              <iframe className="h-full w-full" src={embedUrl} title={resource.name} allowFullScreen />
            </div>
            <a className="text-sm text-blue-700" href={linkUrl || ""} target="_blank" rel="noreferrer">
              Open on YouTube
            </a>
          </div>
        );
      }
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-700">{resource.name}</span>
        {resource.contentType && (
          <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600">{resource.contentType}</span>
        )}
        {linkUrl && (
          <>
            <a className="text-blue-700" href={linkUrl} target="_blank" rel="noreferrer">
              Open
            </a>
            {resource.kind === "file" && (
              <a className="text-blue-700" href={linkUrl} target="_blank" rel="noreferrer" download>
                Download
              </a>
            )}
          </>
        )}
      </div>
    );
  };

  const submitQuiz = async () => {
    if (!quiz || !lesson || !user) return;
    setQuizSubmitting(true);
    setQuizError(null);
    try {
      const attempt = await submitQuizAttempt({
        uid: user.uid,
        lessonId: lesson.id,
        courseId: lesson.courseId || params.courseId,
        answers: quizAnswers,
      });
      setQuizAttempt(attempt);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "Failed to submit quiz.");
    } finally {
      setQuizSubmitting(false);
    }
  };
  const quizReady = lesson?.type === "quiz" && !!quiz;
  const quizCompleted = !!quizAttempt;
  const isQuestionAnswered = (question: QuizQuestion, answer?: QuizAnswer) => {
    if (!answer) return false;
    if (question.type === "single") return answer.type === "single" && !!answer.optionId;
    if (question.type === "multi") return answer.type === "multi" && answer.optionIds.length > 0;
    if (question.type === "short") return answer.type === "short" && answer.value.trim().length > 0;
    if (question.type === "match") {
      return answer.type === "match" && question.left.every((item) => !!answer.pairs[item.id]);
    }
    return false;
  };
  const quizAnswered = !!quiz && quiz.questions.every((q) => isQuestionAnswered(q, quizAnswers[q.id]));

  return (
    <RequireEnrollment courseId={params.courseId}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4">
          <Link href={`/learn/${params.courseId}`} className="text-sm text-blue-700">
            &lt; Back to course
          </Link>
          <h1 className="text-3xl font-semibold">{lesson ? pickLang(lesson.title_kz, lesson.title_en, lang) : "Lesson"}</h1>
          {course && <p className="text-sm text-neutral-600">{pickLang(course.title_kz, course.title_en, lang)}</p>}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <Card className="space-y-4">
            {loadingLesson && <p className="text-sm text-neutral-600">Loading lesson...</p>}
            {!loadingLesson && !lesson && (
              <p className="text-sm text-neutral-600">Lesson not found.</p>
            )}
            {lesson?.type === "video" && lesson.videoUrl && (
              (() => {
                const embedUrl = getYouTubeEmbedUrl(lesson.videoUrl);
                if (embedUrl) {
                  return (
                    <div className="aspect-video w-full overflow-hidden rounded-xl bg-neutral-100">
                      <iframe className="h-full w-full" src={embedUrl} title={lesson.title_en} allowFullScreen />
                    </div>
                  );
                }
                return (
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <p className="text-neutral-700">Video link</p>
                    <a className="text-blue-700" href={lesson.videoUrl} target="_blank" rel="noreferrer">
                      Open video
                    </a>
                  </div>
                );
              })()
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
                <div className="space-y-2">
                  {lesson.attachments.map((file) =>
                    isPdfUrl(file.url) ? (
                      <PdfViewer key={file.url} url={file.url} title={file.name} />
                    ) : (
                      <FilePreview key={file.url} url={file.url} filename={file.name} />
                    ),
                  )}
                </div>
              </div>
            )}
            {lesson?.resources && lesson.resources.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Resources</p>
                <div className="space-y-2">
                  {lesson.resources.map((resource, idx) => (
                    <div key={resource.id || `${resource.kind}-${resource.url || resource.name}-${idx}`} className="min-w-0">
                      {renderResource(resource)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {lesson?.type === "quiz" && (
              <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Quiz</p>
                    {quizCompleted && quizAttempt && (
                      <p className="text-xs text-neutral-600">
                        Score: {quizAttempt.pointsEarned}/{quizAttempt.pointsMax} ({quizAttempt.percent}%)
                      </p>
                    )}
                  </div>
                  {quizError && <span className="text-xs text-red-600">{quizError}</span>}
                </div>
                {!user && <p className="text-sm text-neutral-600">Please sign in to access the quiz.</p>}
                {user && !quizReady && <p className="text-sm text-neutral-600">No quiz configured.</p>}
                {user && quizReady && quiz && (
                  <div className="space-y-4">
                    {quiz.questions.map((question) => {
                      const prompt = pickLang(question.prompt_kz, question.prompt_en, lang);
                      const selectedAnswer = quizCompleted ? quizAttempt?.answers[question.id] : quizAnswers[question.id];
                      const result = quizAttempt?.results.find((item) => item.questionId === question.id);
                      return (
                        <div key={question.id} className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{prompt}</p>
                            {quizCompleted && result && (
                              <span className="text-xs text-neutral-600">
                                {result.earnedPoints}/{result.maxPoints} {result.isCorrect ? "Correct" : "Checked"}
                              </span>
                            )}
                          </div>
                          {question.imageUrl && <FilePreview url={question.imageUrl} contentType="image/*" maxHeight={200} />}
                          {question.type === "single" && (
                            <div className="space-y-1">
                              {question.options.map((opt) => {
                                const isSelected = selectedAnswer?.type === "single" && selectedAnswer.optionId === opt.id;
                                return (
                                  <label key={opt.id} className="flex items-center gap-2 text-sm text-neutral-700">
                                    <input
                                      type="radio"
                                      name={`q-${question.id}`}
                                      checked={isSelected}
                                      disabled={quizCompleted}
                                      onChange={() =>
                                        setQuizAnswers((prev) => ({
                                          ...prev,
                                          [question.id]: { type: "single", optionId: opt.id },
                                        }))
                                      }
                                    />
                                    <span>{pickLang(opt.text_kz, opt.text_en, lang)}</span>
                                    {opt.imageUrl && (
                                      <a className="text-xs text-blue-700" href={opt.imageUrl} target="_blank" rel="noreferrer">
                                        Image
                                      </a>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {question.type === "multi" && (
                            <div className="space-y-1">
                              {question.options.map((opt) => {
                                const current = selectedAnswer?.type === "multi" ? selectedAnswer.optionIds : [];
                                const checked = current.includes(opt.id);
                                return (
                                  <label key={opt.id} className="flex items-center gap-2 text-sm text-neutral-700">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={quizCompleted}
                                      onChange={() =>
                                        setQuizAnswers((prev) => {
                                          const next = new Set(current);
                                          if (next.has(opt.id)) {
                                            next.delete(opt.id);
                                          } else {
                                            next.add(opt.id);
                                          }
                                          return {
                                            ...prev,
                                            [question.id]: { type: "multi", optionIds: Array.from(next) },
                                          };
                                        })
                                      }
                                    />
                                    <span>{pickLang(opt.text_kz, opt.text_en, lang)}</span>
                                    {opt.imageUrl && (
                                      <a className="text-xs text-blue-700" href={opt.imageUrl} target="_blank" rel="noreferrer">
                                        Image
                                      </a>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {question.type === "short" && (
                            <Input
                              placeholder="Your answer"
                              value={selectedAnswer?.type === "short" ? selectedAnswer.value : ""}
                              disabled={quizCompleted}
                              onChange={(e) =>
                                setQuizAnswers((prev) => ({
                                  ...prev,
                                  [question.id]: { type: "short", value: e.target.value },
                                }))
                              }
                            />
                          )}
                          {question.type === "match" && (
                            <div className="space-y-2">
                              {question.left.map((leftItem) => {
                                const pairs = selectedAnswer?.type === "match" ? selectedAnswer.pairs : {};
                                const value = pairs[leftItem.id] || "";
                                return (
                                  <div key={leftItem.id} className="grid gap-2 md:grid-cols-[1fr,1fr]">
                                    <span className="text-sm text-neutral-700">{pickLang(leftItem.text_kz, leftItem.text_en, lang)}</span>
                                    <Select
                                      value={value}
                                      disabled={quizCompleted}
                                      onChange={(e) =>
                                        setQuizAnswers((prev) => ({
                                          ...prev,
                                          [question.id]: {
                                            type: "match",
                                            pairs: { ...(pairs || {}), [leftItem.id]: e.target.value },
                                          },
                                        }))
                                      }
                                    >
                                      <option value="">Select match</option>
                                      {question.right.map((rightItem) => (
                                        <option key={rightItem.id} value={rightItem.id}>
                                          {pickLang(rightItem.text_kz, rightItem.text_en, lang)}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!quizCompleted && (
                      <Button onClick={submitQuiz} disabled={!quizAnswered || quizSubmitting}>
                        {quizSubmitting ? "Submitting..." : "Submit quiz"}
                      </Button>
                    )}
                    {quizCompleted && <p className="text-xs text-neutral-500">Quiz submitted.</p>}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={!prevLessonId}
                onClick={() => prevLessonId && router.push(`/learn/${params.courseId}/lesson/${prevLessonId}`)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!nextLessonId}
                onClick={() => nextLessonId && router.push(`/learn/${params.courseId}/lesson/${nextLessonId}`)}
              >
                Next
              </Button>
              {completedLessons.includes(params.lessonId) ? (
                <Button onClick={unmarkCompleted} disabled={savingComplete}>
                  {savingComplete ? "Saving..." : "Completed (undo)"}
                </Button>
              ) : (
                <Button onClick={markCompleted} disabled={savingComplete}>
                  {savingComplete ? "Saving..." : "Mark completed"}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {assignment ? (
                <Link href={`/assignment/${assignment.id}`}>
                  <Button fullWidth>Go to homework</Button>
                </Link>
              ) : (
                <p className="text-sm text-neutral-600">No homework for this lesson.</p>
              )}
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-neutral-500">Syllabus</p>
                  <p className="text-sm text-neutral-700">Modules & lessons</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => router.push(`/learn/${params.courseId}`)}>
                  Back to course
                </Button>
              </div>
              {modules.length === 0 && (
                <p className="text-sm text-neutral-600">Course has no lessons yet.</p>
              )}
              <div className="space-y-3">
                {modules.map((mod) => (
                  <div key={mod.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                    <p className="text-sm font-semibold">{pickLang(mod.title_kz, mod.title_en, lang)}</p>
                    <div className="mt-2 space-y-2">
                      {(lessonsByModule[mod.id] || []).map((item) => {
                        const isCurrent = item.id === params.lessonId;
                        const isCompleted = completedLessons.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!canAccessContent}
                            onClick={() => router.push(`/learn/${params.courseId}/lesson/${item.id}`)}
                            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                              isCurrent ? "bg-blue-50 text-blue-700" : "bg-white text-neutral-700"
                            }`}
                          >
                            <span>{pickLang(item.title_kz, item.title_en, lang)}</span>
                            <span className={`text-xs font-semibold ${isCompleted ? "text-green-700" : "text-neutral-500"}`}>
                              {isCompleted ? "Completed" : "Not completed"}
                            </span>
                          </button>
                        );
                      })}
                      {(lessonsByModule[mod.id] || []).length === 0 && (
                        <p className="text-xs text-neutral-500">No lessons yet.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </RequireEnrollment>
  );
}
