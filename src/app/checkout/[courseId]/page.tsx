'use client';

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Textarea from "../../../components/ui/textarea";
import { RequireAuth } from "../../../components/guards";
import { useAuth } from "../../../lib/auth-context";
import {
  createPendingPayment,
  fetchCourse,
  getPaymentForCourse,
  getActiveEnrollment,
  subscribeToPayment,
  uploadPaymentProof,
} from "../../../lib/data";
import { db } from "../../../lib/firebase";
import { useI18n, pickLang } from "../../../lib/i18n";
import type { Course, Enrollment, Payment } from "../../../lib/types";

export default function CheckoutPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { lang } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [proofText, setProofText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params?.courseId) {
      fetchCourse(params.courseId).then(setCourse);
    }
  }, [params?.courseId]);

  useEffect(() => {
    if (!user || !params?.courseId) return;
    getPaymentForCourse(user.uid, params.courseId)
      .then(setPayment)
      // Treat permission errors as "no payment" to keep UI stable.
      .catch(() => setPayment(null));
    getActiveEnrollment(user.uid, params.courseId)
      .then(setEnrollment)
      // Treat permission errors as "no access" to keep UI stable.
      .catch(() => setEnrollment(null));
  }, [user, params?.courseId]);

  useEffect(() => {
    if (!paymentId) return;
    const unsub = subscribeToPayment(paymentId, (nextPayment) => {
      setPayment(nextPayment);
      if (nextPayment?.status === "approved") {
        router.push(`/learn/${params.courseId}`);
      }
    });
    return () => unsub();
  }, [paymentId, router, params.courseId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !params?.courseId || !course) return;
    setError(null);
    setLoading(true);
    try {
      if (enrollment?.status === "active") {
        setError("You already own this course.");
        return;
      }
      if (payment?.status === "pending" || payment?.status === "approved") {
        setError("You already have a payment for this course.");
        return;
      }
      const createdId = await createPendingPayment(user.uid, params.courseId);
      setPaymentId(createdId);
      if (file) {
        await uploadPaymentProof(user.uid, createdId, file);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit payment proof";
      if (message === "ALREADY_PURCHASED") {
        setError("You already own this course.");
      } else if (message === "PAYMENT_EXISTS") {
        setError("You already have a payment for this course.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href={`/courses/${params.courseId}`} className="text-sm text-blue-700">
          ← Back to course
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Manual payment</h1>
        {course && <p className="text-sm text-neutral-600">{pickLang(course.title_kz, course.title_en, lang)}</p>}
        <Card className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-neutral-700">Kaspi instructions</p>
            <p className="text-sm text-neutral-600">
              Pay via Kaspi to IBAN <strong>KZ0000</strong> with comment <strong>ENT {course?.id}</strong>. Upload a screenshot or enter the transaction
              comment so admin can confirm.
            </p>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Amount</label>
              <Input value={course ? `${course.price} ${course.currency}` : ""} disabled />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Proof / comment</label>
              <Textarea value={proofText} onChange={(e) => setProofText(e.target.value)} placeholder="Kaspi comment, payer name, etc." required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Attach screenshot (optional)</label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit for review"}
            </Button>
          </form>
        </Card>
      </div>
    </RequireAuth>
  );
}
