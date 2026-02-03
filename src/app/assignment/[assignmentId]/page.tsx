'use client';

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Textarea from "../../../components/ui/textarea";
import { RequireAuth } from "../../../components/guards";
import { serverTimestamp } from "firebase/firestore";
import { fetchAssignment, fetchLesson, subscribeToUserSubmission, submitAssignmentText, updateSubmissionContent, uploadAssignmentFile } from "../../../lib/data";
import { useAuth } from "../../../lib/auth-context";
import { useI18n, pickLang } from "../../../lib/i18n";
import { formatAnyTimestamp } from "../../../lib/utils";
import type { Assignment, Lesson, Submission } from "../../../lib/types";

export default function AssignmentPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const { lang, t } = useI18n();
  const { user, loading } = useAuth();
  const isDev = process.env.NODE_ENV !== "production";
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [allowResubmit, setAllowResubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxFileSizeBytes = 20 * 1024 * 1024;
  const allowedTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);

  useEffect(() => {
    if (loading || !user) return;
    if (!params?.assignmentId) return;
    fetchAssignment(params.assignmentId).then((a) => {
      setAssignment(a);
      if (a?.lessonId) {
        fetchLesson(a.lessonId).then(setLesson);
      }
    });
  }, [params?.assignmentId, user, loading]);

  useEffect(() => {
    if (!assignment?.id || !user) {
      setSubmission(null);
      return;
    }
    const unsub = subscribeToUserSubmission(user.uid, assignment.id, setSubmission);
    return () => unsub();
  }, [assignment?.id, user]);

  const filenameFromUrl = (url?: string | null) => {
    if (!url) return "";
    try {
      const parts = url.split("/");
      return decodeURIComponent(parts[parts.length - 1] || "");
    } catch {
      return url;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !assignment) return;
    setError(null);
    setSubmitting(true);
    try {
      if (submission && !allowResubmit) {
        setError(t("assignment.alreadySubmitted"));
        return;
      }
      if (file) {
        if (!allowedTypes.has(file.type)) {
          setError(t("assignment.invalidFileType"));
          return;
        }
        if (file.size > maxFileSizeBytes) {
          setError(t("assignment.fileTooLarge"));
          return;
        }
      }
      const courseId = assignment.courseId || lesson?.courseId;
      if (!courseId || !assignment.lessonId) {
        setError(t("assignment.missingCourseLesson"));
        return;
      }
      const submissionId = submission?.id
        ? (await updateSubmissionContent(submission.id, { textAnswer, submittedAt: serverTimestamp() }), submission.id)
        : await submitAssignmentText({
            uid: user.uid,
            assignmentId: assignment.id,
            courseId,
            lessonId: assignment.lessonId,
            textAnswer,
          });
      if (file) {
        if (isDev) console.info("[upload] start", { assignmentId: assignment.id, uid: user.uid });
        await uploadAssignmentFile({ uid: user.uid, assignmentId: assignment.id, submissionId, file });
        if (isDev) console.info("[upload] success", { assignmentId: assignment.id, uid: user.uid });
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      if (isDev) console.error("[upload] failure", err);
      const message = err instanceof Error ? err.message : t("assignment.submitError");
      const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code?: string }).code) : "";
      if (message.toLowerCase().includes("permission") || code === "storage/unauthorized") {
        setError(t("assignment.uploadDenied"));
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/dashboard" className="text-sm text-[var(--text)]">
          ← {t("buttons.backToCourse")}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{assignment ? pickLang(assignment.title_kz, assignment.title_en, lang) : t("assignment.title")}</h1>
        {lesson && <p className="text-sm text-[var(--muted)]">{pickLang(lesson.title_kz, lesson.title_en, lang)}</p>}
        <Card className="mt-4">
          <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-[var(--text)]">{assignment && pickLang(assignment.instructions_kz, assignment.instructions_en, lang)}</p>
            {submission && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-[var(--muted)]">{t("lesson.yourSubmission")}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      submission.checkedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {submission.checkedAt ? t("lesson.statusChecked") : t("lesson.statusPending")}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-[var(--text)]">
                  <p>
                    {t("lesson.submittedAt")}: {formatAnyTimestamp(submission.submittedAt)}
                  </p>
                  {submission.grade !== null && submission.grade !== undefined && (
                    <p className="text-base font-semibold">
                      {t("lesson.grade")}: {submission.grade}
                    </p>
                  )}
                  {submission.feedback && (
                    <div className="rounded-md bg-[var(--card)] p-2 text-sm">
                      <p className="text-[12px] font-semibold uppercase text-[var(--muted)]">{t("lesson.feedback")}</p>
                      <p>{submission.feedback}</p>
                    </div>
                  )}
                  {submission.checkedAt && (
                    <p className="text-xs text-[var(--muted)]">
                      {t("lesson.checkedAt")}: {formatAnyTimestamp(submission.checkedAt)}
                    </p>
                  )}
                  {submission.fileUrl && (
                    <div className="space-y-1">
                      <p className="text-[12px] font-semibold uppercase text-[var(--muted)]">{t("assignment.attachFile")}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-[var(--muted)]">{submission.fileName || filenameFromUrl(submission.fileUrl)}</span>
                        <a className="text-[var(--text)]" href={submission.fileUrl} target="_blank" rel="noreferrer">
                          {t("assignment.openAttachment")}
                        </a>
                        <a className="text-[var(--text)]" href={submission.fileUrl} target="_blank" rel="noreferrer" download>
                          {t("assignment.downloadAttachment")}
                        </a>
                      </div>
                      {((submission.contentType && submission.contentType.startsWith("image/")) ||
                        submission.fileUrl.endsWith(".jpg") ||
                        submission.fileUrl.endsWith(".jpeg") ||
                        submission.fileUrl.endsWith(".png") ||
                        submission.fileUrl.endsWith(".webp")) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={submission.fileUrl} alt="Submission attachment" className="max-h-40 rounded-md object-contain" />
                      )}
                      {(submission.contentType === "application/pdf" || submission.fileUrl.endsWith(".pdf")) && (
                        <a className="text-[var(--text)]" href={submission.fileUrl} target="_blank" rel="noreferrer">
                          {t("assignment.openAttachment")}
                        </a>
                      )}
                    </div>
                  )}
                </div>
                {!allowResubmit && (
                  <div className="mt-3 flex items-center justify-between rounded-md bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted)]">
                    <span>{t("assignment.allowResubmit")}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAllowResubmit(true)}>
                      {t("buttons.resubmit")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-[var(--text)]">{t("assignment.textAnswer")}</label>
              <Textarea rows={5} value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} placeholder={t("assignment.textAnswerPlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-semibold text-[var(--text)]">{t("assignment.attachFile")}</label>
              <Input
                type="file"
                accept="application/pdf,image/*,.docx"
                onChange={(e) => {
                  setError(null);
                  setFile(e.target.files?.[0] || null);
                }}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting || (!!submission && !allowResubmit)}>
              {submitting ? t("assignment.submitting") : t("assignment.submitHomework")}
            </Button>
          </form>
        </Card>
      </div>
    </RequireAuth>
  );
}
