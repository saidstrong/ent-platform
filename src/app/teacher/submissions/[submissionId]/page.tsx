'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Button from "../../../../components/ui/button";
import Card from "../../../../components/ui/card";
import Input from "../../../../components/ui/input";
import Textarea from "../../../../components/ui/textarea";
import { RequireAuth, RequireTeacherOrAdmin } from "../../../../components/guards";
import { useAuth } from "../../../../lib/auth-context";
import { fetchAssignment, fetchUserProfile, subscribeToSubmissionById, updateSubmissionReview } from "../../../../lib/data";
import { formatAnyTimestamp } from "../../../../lib/utils";
import { serverTimestamp } from "firebase/firestore";
import type { Assignment, Submission, UserProfile } from "../../../../lib/types";

export default function TeacherSubmissionPage() {
  const params = useParams<{ submissionId: string }>();
  const { user } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [feedback, setFeedback] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!params?.submissionId) return;
    dirtyRef.current = false;
    const unsub = subscribeToSubmissionById(
      params.submissionId,
      (nextSubmission) => {
        setSubmission(nextSubmission);
        setLoading(false);
        if (!dirtyRef.current) {
          setFeedback(nextSubmission?.feedback ?? "");
          setGrade(nextSubmission?.grade !== null && nextSubmission?.grade !== undefined ? String(nextSubmission.grade) : "");
        }
        if (nextSubmission?.assignmentId) {
          fetchAssignment(nextSubmission.assignmentId)
            .then(setAssignment)
            .catch(() => null);
        } else {
          setAssignment(null);
        }
        if (nextSubmission?.uid) {
          fetchUserProfile(nextSubmission.uid)
            .then(setStudent)
            .catch(() => null);
        } else {
          setStudent(null);
        }
      },
      {
        onError: (err) => {
          setLoading(false);
          setError(err instanceof Error ? err.message : "Failed to load submission.");
        },
      },
    );
    return () => unsub();
  }, [params?.submissionId]);

  const parseGrade = () => {
    const raw = grade.trim();
    if (raw === "") return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setError("Grade must be a number.");
      return undefined;
    }
    return parsed;
  };

  const saveDraft = async () => {
    if (!submission || !user) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const gradeValue = parseGrade();
      if (gradeValue === undefined) return;
      await updateSubmissionReview(submission.id, { feedback, grade: gradeValue });
      setNotice("Draft saved.");
      dirtyRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const markChecked = async () => {
    if (!submission || !user) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const gradeValue = parseGrade();
      if (gradeValue === undefined) return;
      await updateSubmissionReview(submission.id, {
        feedback,
        grade: gradeValue,
        checkedAt: serverTimestamp(),
        checkedBy: user.uid,
      });
      setNotice("Marked checked.");
      dirtyRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update submission.");
    } finally {
      setSaving(false);
    }
  };

  const uncheck = async () => {
    if (!submission || !user) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const gradeValue = parseGrade();
      if (gradeValue === undefined) return;
      await updateSubmissionReview(submission.id, {
        feedback,
        grade: gradeValue,
        checkedAt: null,
        checkedBy: null,
      });
      setNotice("Unchecked.");
      dirtyRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update submission.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth>
      <RequireTeacherOrAdmin>
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
          <div className="space-y-2">
            <Link href="/teacher" className="text-sm text-blue-700">
              Back to inbox
            </Link>
            <h1 className="text-2xl font-semibold">Submission review</h1>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}

          <Card className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
              <span>{assignment?.title_en || submission?.assignmentId}</span>
              <span>Submitted: {formatAnyTimestamp(submission?.submittedAt)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>Student: {student?.displayName || student?.email || submission?.uid}</span>
              <span>Course: {submission?.courseId || "-"}</span>
              <span>Lesson: {submission?.lessonId || "-"}</span>
              {submission?.checkedAt ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">Checked</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Pending</span>
              )}
            </div>
            {loading && <p className="text-sm text-neutral-600">Loading submission...</p>}
            {assignment?.instructions_en && (
              <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-600">
                <p className="font-semibold text-neutral-700">Assignment instructions</p>
                <p>{assignment.instructions_en}</p>
              </div>
            )}
            {submission?.textAnswer && <p className="text-sm text-neutral-700">Answer: {submission.textAnswer}</p>}
            {submission?.fileUrl && (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-600">{submission.fileName || submission.fileUrl}</span>
                  <a className="text-blue-700" href={submission.fileUrl} target="_blank" rel="noreferrer">
                    Open
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
                  <a className="text-blue-700" href={submission.fileUrl} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                )}
              </div>
            )}
            <div className="text-xs text-neutral-500">
              <p>Checked at: {formatAnyTimestamp(submission?.checkedAt)}</p>
              <p>Checked by: {submission?.checkedBy || "-"}</p>
            </div>
          </Card>

          <Card className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-neutral-700">Feedback</label>
              <Textarea
                rows={4}
                value={feedback}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setFeedback(e.target.value);
                }}
                placeholder="Write feedback..."
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Grade</label>
              <Input
                type="number"
                value={grade}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setGrade(e.target.value);
                }}
                placeholder="e.g. 95"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={saving} onClick={saveDraft}>
                {saving ? "Saving..." : "Save draft"}
              </Button>
              <Button disabled={saving} onClick={markChecked}>
                {saving ? "Saving..." : "Mark checked"}
              </Button>
              <Button variant="secondary" disabled={saving} onClick={uncheck}>
                Uncheck
              </Button>
            </div>
          </Card>
        </div>
      </RequireTeacherOrAdmin>
    </RequireAuth>
  );
}
