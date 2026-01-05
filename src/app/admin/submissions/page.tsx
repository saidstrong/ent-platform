'use client';

import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Textarea from "../../../components/ui/textarea";
import { listSubmissions, updateSubmissionFeedback, fetchAssignment } from "../../../lib/data";
import { formatAnyTimestamp } from "../../../lib/utils";
import type { Assignment, Submission } from "../../../lib/types";

type SubmissionRow = Submission & { assignment?: Assignment | null };

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [editing, setEditing] = useState<{ [id: string]: { feedback: string; grade?: number } }>({});
  const [loading, setLoading] = useState(false);

  const load = () => {
    listSubmissions().then(async (subs) => {
      const enriched: SubmissionRow[] = [];
      for (const s of subs) {
        enriched.push({ ...s, assignment: await fetchAssignment(s.assignmentId) });
      }
      setSubmissions(enriched);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const saveFeedback = async (submission: Submission) => {
    const entry = editing[submission.id];
    if (!entry) return;
    setLoading(true);
    await updateSubmissionFeedback(submission.id, entry.feedback, entry.grade, "admin");
    setLoading(false);
    setEditing((prev) => ({ ...prev, [submission.id]: { feedback: "", grade: undefined } }));
    load();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Submissions</h2>
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
            {s.textAnswer && <p className="text-sm text-neutral-700">Answer: {s.textAnswer}</p>}
            {s.fileUrl && (
              <a className="text-sm font-semibold text-blue-700" href={s.fileUrl} target="_blank" rel="noreferrer">
                View file
              </a>
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
                value={editing[s.id]?.grade ?? s.grade ?? ""}
                onChange={(e) =>
                  setEditing((prev) => ({ ...prev, [s.id]: { ...prev[s.id], grade: Number(e.target.value) || undefined } }))
                }
              />
              <Button size="sm" disabled={loading} onClick={() => saveFeedback(s)}>
                Save feedback
              </Button>
            </div>
          </Card>
        ))}
        {submissions.length === 0 && <p className="text-sm text-neutral-600">No submissions yet.</p>}
      </div>
    </div>
  );
}
