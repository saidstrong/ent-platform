'use client';

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Textarea from "../../../components/ui/textarea";
import { listAllCourses, listSubmissions, listSubmissionsForCourse, updateSubmissionFeedback, fetchAssignment } from "../../../lib/data";
import { formatAnyTimestamp } from "../../../lib/utils";
import type { Assignment, Course, Submission } from "../../../lib/types";

type SubmissionRow = Submission & { assignment?: Assignment | null };

export default function AdminSubmissionsPage() {
  const params = useSearchParams();
  const courseId = params.get("courseId");
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState(courseId ?? "");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [uidFilter, setUidFilter] = useState("");
  const [editing, setEditing] = useState<{ [id: string]: { feedback: string; grade: number | null } }>({});
  const [loading, setLoading] = useState(false);

  const load = () => {
    const loader = courseFilter ? listSubmissionsForCourse(courseFilter) : listSubmissions();
    loader.then(async (subs) => {
      const enriched: SubmissionRow[] = [];
      for (const s of subs) {
        enriched.push({ ...s, assignment: await fetchAssignment(s.assignmentId) });
      }
      setSubmissions(enriched);
    });
  };

  useEffect(() => {
    load();
  }, [courseFilter]);

  useEffect(() => {
    listAllCourses().then(setCourses).catch(() => null);
  }, []);

  const filteredSubmissions = useMemo(() => {
    const assignmentNeedle = assignmentFilter.trim().toLowerCase();
    const uidNeedle = uidFilter.trim().toLowerCase();
    return submissions.filter((s) => {
      const matchAssignment = assignmentNeedle
        ? (s.assignmentId || "").toLowerCase().includes(assignmentNeedle)
        : true;
      const matchUid = uidNeedle ? (s.uid || "").toLowerCase().includes(uidNeedle) : true;
      return matchAssignment && matchUid;
    });
  }, [submissions, assignmentFilter, uidFilter]);

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

  const saveFeedback = async (submission: Submission) => {
    const entry = editing[submission.id];
    const feedback = entry?.feedback ?? submission.feedback ?? "";
    const gradeValue = entry?.grade ?? submission.grade ?? null;
    const gradeToSave = Number.isFinite(gradeValue as number) ? (gradeValue as number) : undefined;
    setLoading(true);
    await updateSubmissionFeedback(submission.id, feedback, gradeToSave, "admin");
    setLoading(false);
    setEditing((prev) => ({ ...prev, [submission.id]: { feedback, grade: gradeToSave ?? null } }));
    load();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Submissions</h2>
      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-neutral-500">Course</label>
            <select
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
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
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-neutral-500">Assignment ID</label>
            <Input value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)} placeholder="Search assignment id" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-neutral-500">Student UID</label>
            <Input value={uidFilter} onChange={(e) => setUidFilter(e.target.value)} placeholder="Search uid" />
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {filteredSubmissions.map((s) => (
          <Card key={s.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{s.assignment?.title_en || s.assignmentId}</p>
                <p className="text-xs text-neutral-500">{s.uid}</p>
              </div>
              <span className="text-xs text-neutral-500">{formatAnyTimestamp(s.submittedAt)}</span>
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
            <div className="space-y-2">
              <Textarea
                rows={3}
                placeholder="Feedback"
                value={editing[s.id]?.feedback ?? s.feedback ?? ""}
                onChange={(e) => setEditing((prev) => ({ ...prev, [s.id]: { ...prev[s.id], feedback: e.target.value } }))}
              />
              <Input
                type="number"
                placeholder="Grade"
                value={
                  editing[s.id]
                    ? editing[s.id]!.grade ?? ""
                    : s.grade ?? ""
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  let parsed: number | null = null;
                  if (raw.trim() !== "") {
                    const num = Number(raw);
                    parsed = Number.isFinite(num) ? num : null;
                  }
                  setEditing((prev) => ({
                    ...prev,
                    [s.id]: {
                      feedback: prev[s.id]?.feedback ?? s.feedback ?? "",
                      grade: parsed,
                    },
                  }));
                }}
              />
              <Button size="sm" disabled={loading} onClick={() => saveFeedback(s)}>
                Save feedback
              </Button>
            </div>
          </Card>
        ))}
        {filteredSubmissions.length === 0 && <p className="text-sm text-neutral-600">No submissions yet.</p>}
      </div>
    </div>
  );
}
