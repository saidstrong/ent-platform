'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import { adminListPaymentsByStatus, adminReviewPayment, fetchCourse } from "../../../lib/data";
import { useAuth } from "../../../lib/auth-context";
import { formatAnyTimestamp } from "../../../lib/utils";
import type { Course, Payment } from "../../../lib/types";

type PaymentWithCourse = Payment & { course?: Course | null };

export default function AdminPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentWithCourse[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [activePayment, setActivePayment] = useState<PaymentWithCourse | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    adminListPaymentsByStatus(filter).then(async (pays) => {
      const enriched: PaymentWithCourse[] = [];
      for (const p of pays) {
        enriched.push({ ...p, course: await fetchCourse(p.courseId) });
      }
      setPayments(enriched);
    });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const applyReview = async (status: "approved" | "rejected") => {
    if (!activePayment) return;
    setSaving(true);
    await adminReviewPayment(activePayment.id, status, user?.uid || "admin", note.trim() ? note.trim() : undefined);
    setPayments((prev) =>
      prev.map((p) =>
        p.id === activePayment.id
          ? { ...p, status, reviewedAt: new Date().toISOString(), reviewerUid: user?.uid || "admin", note: note.trim() || undefined }
          : p,
      ),
    );
    setSaving(false);
    setActivePayment((prev) => (prev ? { ...prev, status } : prev));
  };

  const statusPill = (status: Payment["status"]) =>
    status === "pending"
      ? "bg-amber-50 text-amber-700"
      : status === "approved"
        ? "bg-green-50 text-green-700"
        : "bg-[var(--surface)] text-[var(--muted)]";

  const selectPayment = (payment: PaymentWithCourse) => {
    setActivePayment(payment);
    setNote(payment.note ?? "");
  };

  const closePayment = () => {
    setActivePayment(null);
    setNote("");
  };

  const columns = useMemo(
    () => ["Created", "UID", "Course", "Status"],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Payment proofs</h2>
        <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant={filter === "pending" ? "primary" : "secondary"} onClick={() => setFilter("pending")}>
            Pending
          </Button>
          <Button size="sm" variant={filter === "approved" ? "primary" : "secondary"} onClick={() => setFilter("approved")}>
            Approved
          </Button>
          <Button size="sm" variant={filter === "rejected" ? "primary" : "secondary"} onClick={() => setFilter("rejected")}>
            Rejected
          </Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-4 gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--muted)]">
          {columns.map((col) => (
            <span key={col}>{col}</span>
          ))}
        </div>
        <div className="divide-y divide-neutral-100">
          {payments.map((p) => (
            <button
              key={p.id}
              className="grid w-full grid-cols-4 gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--surface)]"
              onClick={() => selectPayment(p)}
              type="button"
            >
              <span className="text-[var(--muted)]">{formatAnyTimestamp(p.createdAt)}</span>
              <span className="text-[var(--text)]">{p.uid}</span>
              <span className="text-[var(--text)]">{p.course?.title_en || p.courseId}</span>
              <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${statusPill(p.status)}`}>{p.status}</span>
            </button>
          ))}
          {payments.length === 0 && <p className="px-4 py-3 text-sm text-[var(--muted)]">No payments yet.</p>}
        </div>
      </Card>

      {activePayment && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <Card className="w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Payment review</h3>
              <Button size="sm" variant="ghost" onClick={closePayment}>
                Close
              </Button>
            </div>
            <div className="text-sm text-[var(--muted)]">
              <p>UID: {activePayment.uid}</p>
              <p>Course: {activePayment.course?.title_en || activePayment.courseId}</p>
              <p>Status: {activePayment.status}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold text-[var(--text)]">
              {activePayment.proofUrl && (
                <a href={activePayment.proofUrl} target="_blank" rel="noreferrer">
                  Open proof
                </a>
              )}
              <a href={`/admin/courses/${activePayment.courseId}`}>Open course</a>
            </div>
            <div>
              <label className="text-sm font-semibold text-[var(--text)]">Note</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for student" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={saving || activePayment.status !== "pending"} onClick={() => applyReview("rejected")}>
                Reject
              </Button>
              <Button size="sm" disabled={saving || activePayment.status !== "pending"} onClick={() => applyReview("approved")}>
                Approve
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
