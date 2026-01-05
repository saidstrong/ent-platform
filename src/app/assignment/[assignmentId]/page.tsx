'use client';

import { collection, doc, serverTimestamp, addDoc, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Textarea from "../../../components/ui/textarea";
import { RequireAuth } from "../../../components/guards";
import { db } from "../../../lib/firebase";
import { fetchAssignment, fetchLesson } from "../../../lib/data";
import { useAuth } from "../../../lib/auth-context";
import { useI18n, pickLang } from "../../../lib/i18n";
import { uploadFile } from "../../../lib/storage";
import type { Assignment, Lesson } from "../../../lib/types";

export default function AssignmentPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const { lang } = useI18n();
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.assignmentId) return;
    fetchAssignment(params.assignmentId).then((a) => {
      setAssignment(a);
      if (a?.lessonId) {
        fetchLesson(a.lessonId).then(setLesson);
      }
    });
  }, [params?.assignmentId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !assignment) return;
    setError(null);
    setLoading(true);
    try {
      const submissionRef = await addDoc(collection(db, "submissions"), {
        assignmentId: assignment.id,
        uid: user.uid,
        textAnswer,
        fileUrl: null,
        submittedAt: serverTimestamp(),
      });
      if (file) {
        const url = await uploadFile(`submissions/${user.uid}/${submissionRef.id}/${file.name}`, file);
        await updateDoc(doc(db, "submissions", submissionRef.id), { fileUrl: url });
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit assignment";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/dashboard" className="text-sm text-blue-700">
          ← Back
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{assignment ? pickLang(assignment.title_kz, assignment.title_en, lang) : "Assignment"}</h1>
        {lesson && <p className="text-sm text-neutral-600">{pickLang(lesson.title_kz, lesson.title_en, lang)}</p>}
        <Card className="mt-4">
          <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-neutral-700">{assignment && pickLang(assignment.instructions_kz, assignment.instructions_en, lang)}</p>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Text answer</label>
              <Textarea rows={5} value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} placeholder="Your solution..." />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Attach file (optional)</label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit homework"}
            </Button>
          </form>
        </Card>
      </div>
    </RequireAuth>
  );
}
