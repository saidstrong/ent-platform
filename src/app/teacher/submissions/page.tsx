'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import { useAuth, isAdmin, isTeacher } from "../../../lib/auth-context";
import { fetchUserProfile, listAllCourses, listQuizAttemptsForCourse, subscribeToSubmissionsForReview } from "../../../lib/data";
import { formatAnyTimestamp } from "../../../lib/utils";
import type { Course, QuizAttempt, Submission, UserProfile } from "../../../lib/types";

export default function TeacherSubmissionsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const initialCourseId = params.get("courseId") || "";
  const { user, profile, loading } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "checked" | "all">("pending");
  const [courseFilter, setCourseFilter] = useState(initialCourseId);
  const [uidFilter, setUidFilter] = useState("");
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [quizLoading, setQuizLoading] = useState(true);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const profilesRef = useRef<Record<string, UserProfile>>({});

  const canAccess = useMemo(() => isAdmin(profile?.role) || isTeacher(profile?.role), [profile?.role]);

  useEffect(() => {
    if (loading || !user || !canAccess) return;
    const unsub = subscribeToSubmissionsForReview(
      (items) => {
        setSubmissions(items);
        setLoadingList(false);
        setError(null);
        const uids = Array.from(new Set(items.map((s) => s.uid).filter(Boolean)));
        if (uids.length === 0) return;
        Promise.all(
          uids
            .filter((uid) => !profilesRef.current[uid])
            .map(async (uid) => ({ uid, profile: await fetchUserProfile(uid) })),
        ).then((results) => {
          if (results.length === 0) return;
          setProfiles((prev) => {
            const next = { ...prev };
            results.forEach(({ uid, profile }) => {
              if (profile) next[uid] = profile;
            });
            profilesRef.current = next;
            return next;
          });
        });
      },
      {
        limit: 100,
        onError: (err) => {
          setLoadingList(false);
          setError(err instanceof Error ? err.message : "Failed to load submissions.");
        },
      },
    );
    return () => unsub();
  }, [loading, user, canAccess]);

  useEffect(() => {
    if (loading || !user || !canAccess) return;
    listAllCourses()
      .then(setCourses)
      .catch(() => null);
  }, [loading, user, canAccess]);

  useEffect(() => {
    if (loading || !user || !canAccess) return;
    setQuizLoading(true);
    listQuizAttemptsForCourse(courseFilter || undefined, 50)
      .then((items) => {
        setQuizAttempts(items);
        setQuizError(null);
        const uids = Array.from(new Set(items.map((attempt) => attempt.uid).filter(Boolean)));
        if (uids.length === 0) return;
        Promise.all(
          uids
            .filter((uid) => !profilesRef.current[uid])
            .map(async (uid) => ({ uid, profile: await fetchUserProfile(uid) })),
        ).then((results) => {
          if (results.length === 0) return;
          setProfiles((prev) => {
            const next = { ...prev };
            results.forEach(({ uid, profile }) => {
              if (profile) next[uid] = profile;
            });
            profilesRef.current = next;
            return next;
          });
        });
      })
      .catch((err) => {
        setQuizError(err instanceof Error ? err.message : "Failed to load quiz attempts.");
      })
      .finally(() => setQuizLoading(false));
  }, [loading, user, canAccess, courseFilter]);

  const filteredSubmissions = useMemo(() => {
    const courseNeedle = courseFilter.trim().toLowerCase();
    const uidNeedle = uidFilter.trim().toLowerCase();
    return submissions.filter((s) => {
      const statusMatch =
        statusFilter === "pending"
          ? !s.checkedAt
          : statusFilter === "checked"
            ? !!s.checkedAt
            : true;
      const courseMatch = courseNeedle ? (s.courseId || "").toLowerCase().includes(courseNeedle) : true;
      const profile = profiles[s.uid];
      const studentNeedle = uidNeedle
        ? (s.uid || "").toLowerCase().includes(uidNeedle)
          || (profile?.displayName || "").toLowerCase().includes(uidNeedle)
          || (profile?.email || "").toLowerCase().includes(uidNeedle)
        : true;
      return statusMatch && courseMatch && studentNeedle;
    });
  }, [submissions, statusFilter, courseFilter, uidFilter, profiles]);

  const pendingCount = useMemo(
    () => submissions.filter((s) => !s.checkedAt).length,
    [submissions],
  );

  if (loading) {
    return <p className="px-4 py-6 text-sm text-[var(--muted)]">Loading...</p>;
  }

  if (!user || !canAccess) {
    return (
      <Card className="m-4">
        <p className="text-sm text-[var(--muted)]">Access denied.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-[var(--text)]">
          Go back
        </Link>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-[var(--muted)]">Teacher</p>
          <h1 className="text-2xl font-semibold">Submissions inbox</h1>
          <p className="text-xs text-[var(--muted)]">Pending count: {pendingCount}</p>
        </div>
        <Link href="/teacher" className="text-sm text-[var(--text)]">
          Back to dashboard
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loadingList && <p className="text-sm text-[var(--muted)]">Loading submissions...</p>}

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-[var(--muted)]">Status</label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={statusFilter === "pending" ? "primary" : "secondary"} onClick={() => setStatusFilter("pending")}>
                Pending
              </Button>
              <Button size="sm" variant={statusFilter === "checked" ? "primary" : "secondary"} onClick={() => setStatusFilter("checked")}>
                Checked
              </Button>
              <Button size="sm" variant={statusFilter === "all" ? "primary" : "secondary"} onClick={() => setStatusFilter("all")}>
                All
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-[var(--muted)]">Course ID</label>
            {courses.length > 0 ? (
              <select
                className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
              >
                <option value="">All courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title_en || course.id}
                  </option>
                ))}
              </select>
            ) : (
              <Input value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} placeholder="Filter by course" />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-[var(--muted)]">Student</label>
            <Input value={uidFilter} onChange={(e) => setUidFilter(e.target.value)} placeholder="Search uid, name, email" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-6 gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--muted)]">
          <span>Submitted</span>
          <span>Course</span>
          <span>Lesson</span>
          <span>Assignment</span>
          <span>Student</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-neutral-100">
          {filteredSubmissions.map((s) => {
            const status = s.checkedAt ? "Checked" : "Pending";
            return (
              <button
                key={s.id}
                className="grid w-full grid-cols-6 gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--surface)]"
                onClick={() => router.push(`/teacher/submissions/${s.id}`)}
                type="button"
              >
                <span className="text-[var(--muted)]">{formatAnyTimestamp(s.submittedAt)}</span>
                <span className="text-[var(--text)]">{courses.find((c) => c.id === s.courseId)?.title_en || s.courseId || "-"}</span>
                <span className="text-[var(--text)]">{s.lessonId || "-"}</span>
                <span className="text-[var(--text)]">{s.assignmentId}</span>
                <span className="text-[var(--text)]">{profiles[s.uid]?.displayName || profiles[s.uid]?.email || s.uid}</span>
                <span className="text-[var(--muted)]">
                  {status}
                  {s.grade !== null && s.grade !== undefined ? ` - ${s.grade}` : ""}
                </span>
              </button>
            );
          })}
          {filteredSubmissions.length === 0 && !loadingList && (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">No submissions found.</p>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
          <p className="text-xs font-semibold text-[var(--muted)]">Recent quiz attempts</p>
          {quizLoading && <span className="text-xs text-[var(--muted)]">Loading...</span>}
        </div>
        {quizError && <p className="px-4 py-3 text-xs text-red-600">{quizError}</p>}
        <div className="grid grid-cols-5 gap-2 border-b border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--muted)]">
          <span>Submitted</span>
          <span>Course</span>
          <span>Lesson</span>
          <span>Student</span>
          <span>Score</span>
        </div>
        <div className="divide-y divide-neutral-100">
          {quizAttempts.map((attempt) => (
            <div key={attempt.id} className="grid grid-cols-5 gap-2 px-4 py-3 text-sm">
              <span className="text-[var(--muted)]">{formatAnyTimestamp(attempt.submittedAt)}</span>
              <span className="text-[var(--text)]">{courses.find((c) => c.id === attempt.courseId)?.title_en || attempt.courseId}</span>
              <span className="text-[var(--text)]">{attempt.lessonId}</span>
              <span className="text-[var(--text)]">{profiles[attempt.uid]?.displayName || profiles[attempt.uid]?.email || attempt.uid}</span>
              <span className="text-[var(--text)]">
                {attempt.pointsEarned}/{attempt.pointsMax} ({attempt.percent}%)
              </span>
            </div>
          ))}
          {!quizLoading && quizAttempts.length === 0 && (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">No quiz attempts yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
