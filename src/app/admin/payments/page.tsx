'use client';

import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import { createEnrollmentFromPayment, listPayments, updatePaymentStatus, fetchCourse } from "../../../lib/data";
import type { Course, Payment } from "../../../lib/types";

type PaymentWithCourse = Payment & { course?: Course | null };

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentWithCourse[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    listPayments({}).then(async (pays) => {
      const enriched: PaymentWithCourse[] = [];
      for (const p of pays) {
        enriched.push({ ...p, course: await fetchCourse(p.courseId) });
      }
      setPayments(enriched);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const confirm = async (payment: Payment) => {
    setLoading(true);
    await createEnrollmentFromPayment({ payment });
    load();
    setLoading(false);
  };

  const reject = async (payment: Payment) => {
    setLoading(true);
    await updatePaymentStatus(payment.id, "rejected");
    load();
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Payment proofs</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {payments.map((p) => (
          <Card key={p.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{p.course?.title_en || p.courseId}</p>
                <p className="text-xs text-neutral-500">{p.uid}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  p.status === "submitted"
                    ? "bg-amber-50 text-amber-700"
                    : p.status === "confirmed"
                      ? "bg-green-50 text-green-700"
                      : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {p.status}
              </span>
            </div>
            <p className="text-sm text-neutral-600">
              Amount: {p.amount} · Provider: {p.provider}
            </p>
            {p.proofText && <p className="text-sm text-neutral-700">Proof: {p.proofText}</p>}
            {p.proofFileUrl && (
              <a className="text-sm font-semibold text-blue-700" href={p.proofFileUrl} target="_blank" rel="noreferrer">
                View file
              </a>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={loading || p.status !== "submitted"} onClick={() => reject(p)}>
                Reject
              </Button>
              <Button size="sm" disabled={loading || p.status !== "submitted"} onClick={() => confirm(p)}>
                Confirm & enroll
              </Button>
            </div>
          </Card>
        ))}
        {payments.length === 0 && <p className="text-sm text-neutral-600">No payments yet.</p>}
      </div>
    </div>
  );
}
