'use client';

import {
  addDoc,
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Assignment,
  Course,
  Enrollment,
  Lesson,
  Module,
  Payment,
  PaymentStatus,
  Submission,
} from "./types";

const mapDoc = <T extends { id: string }>(snap: DocumentSnapshot<DocumentData>): T =>
  ({
    id: snap.id,
    ...(snap.data() as Omit<T, "id">),
  }) as T;

export const fetchPublishedCourses = async (): Promise<Course[]> => {
  const q = query(collection(db, "courses"), where("published", "==", true), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Course>(d));
};

export const listAllCourses = async (): Promise<Course[]> => {
  const q = query(collection(db, "courses"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Course>(d));
};

export const fetchCourse = async (courseId: string): Promise<Course | null> => {
  const snap = await getDoc(doc(db, "courses", courseId));
  if (!snap.exists()) return null;
  return mapDoc<Course>(snap);
};

export const saveCourse = async (course: Partial<Course> & { id?: string }) => {
  if (course.id) {
    await updateDoc(doc(db, "courses", course.id), { ...course, updatedAt: serverTimestamp() });
    return course.id;
  }
  const ref = await addDoc(collection(db, "courses"), { ...course, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
};

export const fetchModules = async (courseId: string): Promise<Module[]> => {
  const q = query(collection(db, "modules"), where("courseId", "==", courseId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Module>(d));
};

export const saveModule = async (module: Partial<Module> & { courseId: string; id?: string }) => {
  if (module.id) {
    await updateDoc(doc(db, "modules", module.id), { ...module, updatedAt: serverTimestamp() });
    return module.id;
  }
  const ref = await addDoc(collection(db, "modules"), { ...module, createdAt: serverTimestamp() });
  return ref.id;
};

export const fetchLessonsForModule = async (moduleId: string): Promise<Lesson[]> => {
  const q = query(collection(db, "lessons"), where("moduleId", "==", moduleId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Lesson>(d));
};

export const fetchLesson = async (lessonId: string): Promise<Lesson | null> => {
  const snap = await getDoc(doc(db, "lessons", lessonId));
  if (!snap.exists()) return null;
  return mapDoc<Lesson>(snap);
};

export const saveLesson = async (lesson: Partial<Lesson> & { moduleId: string; id?: string }) => {
  if (lesson.id) {
    await updateDoc(doc(db, "lessons", lesson.id), { ...lesson, updatedAt: serverTimestamp() });
    return lesson.id;
  }
  const ref = await addDoc(collection(db, "lessons"), { ...lesson, createdAt: serverTimestamp() });
  return ref.id;
};

export const getActiveEnrollment = async (uid: string, courseId: string): Promise<Enrollment | null> => {
  const enrollmentId = `${uid}_${courseId}`;
  const direct = await getDoc(doc(db, "enrollments", enrollmentId));
  if (direct.exists() && direct.data().status === "active") {
    return mapDoc<Enrollment>(direct);
  }
  const q = query(collection(db, "enrollments"), where("uid", "==", uid), where("courseId", "==", courseId), where("status", "==", "active"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapDoc<Enrollment>(snap.docs[0]);
};

export const listEnrollments = async (uid: string): Promise<Enrollment[]> => {
  const q = query(collection(db, "enrollments"), where("uid", "==", uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Enrollment>(d));
};

export const listPayments = async (opts: { uid?: string; status?: PaymentStatus } = {}): Promise<Payment[]> => {
  const constraints = [];
  if (opts.uid) constraints.push(where("uid", "==", opts.uid));
  if (opts.status) constraints.push(where("status", "==", opts.status));
  const q = query(collection(db, "payments"), ...constraints, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Payment>(d));
};

export const createPayment = async (payment: Omit<Payment, "id" | "status" | "createdAt" | "updatedAt"> & { status?: PaymentStatus }) => {
  const ref = await addDoc(collection(db, "payments"), {
    ...payment,
    status: payment.status ?? "submitted",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updatePaymentStatus = async (paymentId: string, status: PaymentStatus) => {
  await updateDoc(doc(db, "payments", paymentId), { status, updatedAt: serverTimestamp() });
};

export const createEnrollmentFromPayment = async ({
  payment,
  accessUntil,
}: {
  payment: Payment;
  accessUntil?: Date;
}) => {
  const enrollmentId = `${payment.uid}_${payment.courseId}`;
  await setDoc(doc(db, "enrollments", enrollmentId), {
    uid: payment.uid,
    courseId: payment.courseId,
    status: "active",
    paidAmount: payment.amount,
    paidAt: serverTimestamp(),
    accessUntil: accessUntil ? accessUntil.toISOString() : null,
    createdAt: serverTimestamp(),
  });
  await updatePaymentStatus(payment.id, "confirmed");
  return enrollmentId;
};

export const getAssignmentByLesson = async (lessonId: string): Promise<Assignment | null> => {
  const q = query(collection(db, "assignments"), where("lessonId", "==", lessonId), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapDoc<Assignment>(snap.docs[0]);
};

export const fetchAssignment = async (assignmentId: string): Promise<Assignment | null> => {
  const snap = await getDoc(doc(db, "assignments", assignmentId));
  if (!snap.exists()) return null;
  return mapDoc<Assignment>(snap);
};

export const createAssignment = async (assignment: Omit<Assignment, "id" | "createdAt">) => {
  const ref = await addDoc(collection(db, "assignments"), { ...assignment, createdAt: serverTimestamp() });
  return ref.id;
};

export const submitAssignment = async (submission: Omit<Submission, "id" | "submittedAt">) => {
  const ref = await addDoc(collection(db, "submissions"), { ...submission, submittedAt: serverTimestamp() });
  return ref.id;
};

export const listSubmissions = async (): Promise<Submission[]> => {
  const snap = await getDocs(query(collection(db, "submissions"), orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => mapDoc<Submission>(d));
};

export const updateSubmissionFeedback = async (submissionId: string, feedback: string, grade?: number, checkedBy?: string) => {
  await updateDoc(doc(db, "submissions", submissionId), {
    feedback,
    grade: grade ?? null,
    checkedBy: checkedBy ?? null,
    checkedAt: serverTimestamp(),
  });
};
