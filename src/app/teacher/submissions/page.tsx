'use client';

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Textarea from "../../../components/ui/textarea";
import { useAuth, isAdmin, isTeacher } from "../../../lib/auth-context";
import { listPendingSubmissions, listSubmissionsForCourse, updateSubmissionFeedback } from "../../../lib/data";
import { formatAnyTimestamp } from "../../../lib/utils";
import type { Submission } from "../../../lib/types";

type ReviewState = { feedback: string; grade: string; saving: boolean };

export default function TeacherSubmissionsPage() {
  const params = useSearchParams();
  const courseId = params.get("courseId") || "";
  const { user, profile, loading } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const canAccess = useMemo(() => isAdmin(profile?.role) || isTeacher(profile?.role), [profile?.role]);

  useEffect(() => {
    if (loading || !user || !canAccess) return;
    setLoadingList(true);
    setError(null);
    const load = async () => {
      const items = courseId
        ? await listSubmissionsForCourse(courseId, { pendingOnly: true, limit: 50 })
        : await listPendingSubmissions(50);
      setSubmissions(items);
    };
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load submissions."))
      .finally(() => setLoadingList(false));
  }, [loading, user, canAccess, courseId]);

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const updateReviewState = (id: string, updates: Partial<ReviewState>) => {
    setReviewState((prev) => ({
      ...prev,
      [id]: {
        feedback: prev[id]?.feedback ?? "",
        grade: prev[id]?.grade ?? "",
        saving: prev[id]?.saving ?? false,
        ...updates,
      },
    }));
  };

  const saveReview = async (submission: Submission) => {
    if (!user) return;
    const state = reviewState[submission.id];
    const feedback = state?.feedback ?? submission.feedback ?? "";
    const rawGrade = state?.grade ?? "";
    let gradeValue: number | undefined = undefined;
    if (rawGrade.trim() !== "") {
      const parsed = Number(rawGrade);
      if (!Number.isFinite(parsed)) {
        setError("Grade must be a number.");
        return;
      }
      gradeValue = parsed;
    }
    updateReviewState(submission.id, { saving: true });
    try {
      await updateSubmissionFeedback(submission.id, feedback, gradeValue, user.uid);
      updateReviewState(submission.id, { saving: false, feedback, grade: rawGrade });
    } catch (err) {
      updateReviewState(submission.id, { saving: false });
      setError(err instanceof Error ? err.message : "Failed to save review.");
    }
  };

  if (loading) {
    return <p className="px-4 py-6 text-sm text-neutral-600">Loading...</p>;
  }

  if (!user || !canAccess) {
    return (
      <Card className="m-4">
        <p className="text-sm text-neutral-600">Access denied.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-blue-700">
          Go back
        </Link>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-neutral-500">Teacher</p>
          <h1 className="text-2xl font-semibold">Submissions inbox</h1>
          {courseId && <p className="text-xs text-neutral-500">Filtered by course: {courseId}</p>}
        </div>
        <Link href="/teacher" className="text-sm text-blue-700">
          Back to dashboard
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loadingList && <p className="text-sm text-neutral-500">Loading submissions...</p>}

      <div className="space-y-3">
        {submissions.map((s) => {
          const state = reviewState[s.id];
          const isExpanded = expandedId === s.id;
          const status = s.checkedAt ? "Checked" : "Pending";
          return (
            <Card key={s.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="space-y-1">
                  <p className="font-semibold">{s.assignmentId}</p>
                  <p className="text-xs text-neutral-500">{s.uid}</p>
                </div>
                <div className="text-right text-xs text-neutral-500">
                  <p>{formatAnyTimestamp(s.submittedAt)}</p>
                  <p>{status}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                <span>Course: {s.courseId}</span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => toggleExpanded(s.id)}>
                {isExpanded ? "Hide" : "Review"}
              </Button>

              {isExpanded && (
                <div className="space-y-3">
                  {s.textAnswer && <p className="text-sm text-neutral-700">Answer: {s.textAnswer}</p>}
                  {s.fileUrl && (
                    <div className="space-y-1 text-sm">
                      <a className="text-blue-700" href={s.fileUrl} target="_blank" rel="noreferrer">
                        Download attachment
                      </a>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      placeholder="Feedback"
                      value={state?.feedback ?? s.feedback ?? ""}
                      onChange={(e) => updateReviewState(s.id, { feedback: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Grade"
                      value={state?.grade ?? (s.grade ?? "").toString()}
                      onChange={(e) => updateReviewState(s.id, { grade: e.target.value })}
                    />
                    <Button size="sm" disabled={state?.saving} onClick={() => saveReview(s)}>
                      {state?.saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {submissions.length === 0 && !loadingList && <p className="text-sm text-neutral-600">No submissions found.</p>}
      </div>
    </div>
  );
}
