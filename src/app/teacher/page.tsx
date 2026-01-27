'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import { RequireAuth, RequireTeacherOrAdmin } from "../../components/guards";
import { fetchAssignment, listAllCourses, listPendingSubmissions, listSubmissions } from "../../lib/data";
import { formatAnyTimestamp } from "../../lib/utils";
import type { Assignment, Course, Submission } from "../../lib/types";

type SubmissionRow = Submission & { assignment?: Assignment | null };

export default function TeacherDashboardPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (showAllFlag: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const subs = showAllFlag ? await listSubmissions() : await listPendingSubmissions();
      const enriched: SubmissionRow[] = [];
      for (const s of subs) {
        enriched.push({ ...s, assignment: await fetchAssignment(s.assignmentId) });
      }
      setSubmissions(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(showAll);
  }, [showAll]);

  useEffect(() => {
    listAllCourses().then(setCourses).catch(() => null);
  }, []);

  const statusLabel = (s: Submission) => (s.checkedAt ? "Checked" : "Pending");

  const toggleFilter = () => {
    setShowAll((prev) => !prev);
  };

  const filenameFromUrl = (url?: string | null, fallbackName?: string | null) => {
    if (fallbackName) return fallbackName;
    if (!url) return "";
    try {
      const parts = url.split("/");
      return decodeURIComponent(parts[parts.length - 1] || "");
    } catch {
      return url;
    }
  };

  return (
    <RequireAuth>
      <RequireTeacherOrAdmin>
        <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
          <div>
            <p className="text-xs uppercase text-neutral-500">Teacher</p>
            <h1 className="text-2xl font-semibold">Teacher dashboard</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900">Inbox</span>
            </div>
          </div>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Inbox</h2>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <span>Unchecked only</span>
                <Button size="sm" variant="secondary" onClick={toggleFilter}>
                  {showAll ? "Show unchecked" : "Show all"}
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading && <p className="text-sm text-neutral-500">Loading submissions...</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {submissions.map((s) => (
                <Card key={s.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{s.assignment?.title_en || s.assignmentId}</p>
                      <p className="text-xs text-neutral-500">{s.uid}</p>
                    </div>
                    <span className="text-xs text-neutral-500">{formatAnyTimestamp(s.submittedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Status: {statusLabel(s)}</span>
                    <Link className="text-blue-700" href={`/teacher/submissions/${s.id}`}>
                      Review
                    </Link>
                  </div>
                  {s.textAnswer && <p className="text-sm text-neutral-700">Answer: {s.textAnswer}</p>}
                  {s.fileUrl && (
                    <div className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-neutral-600">{filenameFromUrl(s.fileUrl, s.fileName)}</span>
                        <a className="text-blue-700" href={s.fileUrl} target="_blank" rel="noreferrer">
                          Open
                        </a>
                        <a className="text-blue-700" href={s.fileUrl} target="_blank" rel="noreferrer" download>
                          Download
                        </a>
                      </div>
                      {((s.contentType && s.contentType.startsWith("image/")) ||
                        s.fileUrl.endsWith(".jpg") ||
                        s.fileUrl.endsWith(".jpeg") ||
                        s.fileUrl.endsWith(".png") ||
                        s.fileUrl.endsWith(".webp")) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.fileUrl} alt="Submission attachment" className="max-h-32 rounded-md object-contain" />
                      )}
                      {(s.contentType === "application/pdf" || s.fileUrl.endsWith(".pdf")) && (
                        <a className="text-blue-700" href={s.fileUrl} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      )}
                    </div>
                  )}
                </Card>
              ))}
              {submissions.length === 0 && !loading && <p className="text-sm text-neutral-600">No submissions found.</p>}
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Courses</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {courses.map((course) => (
                <div key={course.id} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm">
                  <p className="font-semibold">{course.title_en}</p>
                  <p className="text-xs text-neutral-500">{course.tags?.join(" • ")}</p>
                </div>
              ))}
              {courses.length === 0 && <p className="text-sm text-neutral-600">No courses found.</p>}
            </div>
          </Card>
        </div>
      </RequireTeacherOrAdmin>
    </RequireAuth>
  );
}
