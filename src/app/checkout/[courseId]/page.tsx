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
  createPayment,
  fetchCourse,
  getCourseAccessState,
  ensureEnrollment,
  subscribeToPayment,
  uploadPaymentProof,
} from "../../../lib/data";
import { useI18n, pickLang } from "../../../lib/i18n";
import type { Course } from "../../../lib/types";

export default function CheckoutPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { lang } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<"enrolled" | "pending" | "approved_waiting_enrollment" | "none">("none");
  const [proofText, setProofText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (params?.courseId) {
      fetchCourse(params.courseId).then(setCourse);
    }
  }, [params?.courseId]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.info("[checkout] auth state", { uid: user?.uid || null, email: user?.email || null, isAuthenticated: !!user });
  }, [user]);

  useEffect(() => {
    if (!user || !params?.courseId) return;
    if (process.env.NODE_ENV !== "production") {
      console.info("[payments][checkout] getCourseAccessState", { uid: user.uid, courseId: params.courseId });
    }
    getCourseAccessState(user.uid, params.courseId)
      .then(({ state, paymentId: nextPaymentId }) => {
        setAccessState(state);
        if (nextPaymentId) setPaymentId(nextPaymentId);
        if (state === "enrolled") {
          router.push(`/learn/${params.courseId}`);
        }
      })
      .catch(() => null);
  }, [user, params?.courseId, router]);

  useEffect(() => {
    if (!user || !paymentId) return;
    if (process.env.NODE_ENV !== "production") {
      console.info("[payments][checkout] subscribe", { uid: user.uid, paymentId });
    }
    const unsub = subscribeToPayment(paymentId, user.uid, (nextPayment) => {
      if (nextPayment?.status === "approved") {
        router.push(`/learn/${params.courseId}`);
      }
    }, "checkout:paymentStatus", { role: profile?.role ?? null, route: "checkout" });
    return () => unsub();
  }, [user, paymentId, router, params.courseId]);

  useEffect(() => {
    if (accessState !== "approved_waiting_enrollment") return;
    if (!user || !params?.courseId) return;
    let active = true;
    ensureEnrollment(user.uid, params.courseId).catch(() => null);
    const timer = setTimeout(() => {
      getCourseAccessState(user.uid, params.courseId)
        .then(({ state }) => {
          if (!active) return;
          if (state === "enrolled") {
            router.push(`/learn/${params.courseId}`);
          }
        })
        .catch(() => null);
    }, 2500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [accessState, user, params?.courseId, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("You must be signed in to submit a payment proof.");
      setErrorCode(null);
      if (process.env.NODE_ENV !== "production") {
        console.info("[checkout] submit blocked: not authenticated");
      }
      return;
    }
    if (!params?.courseId || !course) return;
    setError(null);
    setErrorCode(null);
    setLoading(true);
    try {
      if (process.env.NODE_ENV !== "production") {
        console.info("[checkout] submit start", { uid: user.uid, email: user.email || null, courseId: params.courseId });
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[payments][checkout] getCourseAccessState", { uid: user.uid, courseId: params.courseId });
      }
      const access = await getCourseAccessState(user.uid, params.courseId);
      setAccessState(access.state);
      if (access.paymentId) setPaymentId(access.paymentId);
      if (access.state === "enrolled") {
        router.push(`/learn/${params.courseId}`);
        return;
      }
      if (access.state === "pending") {
        setError("Your payment is already under review.");
        if (file && access.paymentId) {
          await uploadPaymentProof(user.uid, access.paymentId, file);
        }
        return;
      }
      if (access.state === "approved_waiting_enrollment") {
        setError("Approved, updating access...");
        return;
      }
      const created = await createPayment({ uid: user.uid, courseId: params.courseId, note: proofText });
      if (created.paymentId) {
        setPaymentId(created.paymentId);
        if (file) {
          await uploadPaymentProof(user.uid, created.paymentId, file);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit payment proof";
      const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code?: string }).code) : null;
      if (message === "ALREADY_PURCHASED") {
        setError("You already own this course.");
      } else if (message === "PAYMENT_EXISTS") {
        setError("You already have a payment for this course.");
      } else {
        setError(message);
      }
      setErrorCode(code);
      if (process.env.NODE_ENV !== "production") {
        console.error("[checkout] submit failed", {
          op: "createPayment",
          path: "payments",
          uid: user.uid,
          courseId: params.courseId,
          code,
          message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href={`/courses/${params.courseId}`} className="text-sm text-blue-700">
          &lt; Back to course
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
            {error && (
              <p className="text-sm text-red-600">
                {error}
                {process.env.NODE_ENV !== "production" && errorCode ? ` (${errorCode})` : ""}
              </p>
            )}
            {accessState === "pending" && <p className="text-sm text-amber-700">Under review. Please wait for approval.</p>}
            {accessState === "approved_waiting_enrollment" && <p className="text-sm text-amber-700">Approved, updating access...</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit for review"}
            </Button>
          </form>
        </Card>
      </div>
    </RequireAuth>
  );
}
