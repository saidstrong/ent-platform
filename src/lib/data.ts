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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { uploadFile } from "./storage";
import type {
  Assignment,
  Course,
  Enrollment,
  Lesson,
  Module,
  Payment,
  PaymentStatus,
  Submission,
  Progress,
} from "./types";

const mapDoc = <T extends { id: string }>(snap: DocumentSnapshot<DocumentData>): T =>
  ({
    id: snap.id,
    ...(snap.data() as Omit<T, "id">),
  }) as T;

export const fetchPublishedCourses = async (): Promise<Course[]> => {
  // Use the root collection to align with rules scoped to /courses/{courseId}.
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
  try {
    console.info("[firestore] fetchCourse doc", { path: "courses", courseId });
    const snap = await getDoc(doc(db, "courses", courseId));
    if (!snap.exists()) return null;
    return mapDoc<Course>(snap);
  } catch (err) {
    console.error("[firestore] fetchCourse error", { courseId, err });
    throw err;
  }
};

export const saveCourse = async (course: Partial<Course> & { id?: string }) => {
  if (course.id) {
    await updateDoc(doc(db, "courses", course.id), { ...course, updatedAt: serverTimestamp() });
    return course.id;
  }
  const ref = await addDoc(collection(db, "courses"), { ...course, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
};

// Admin helpers keep CRUD paths consistent for the admin UI.
export const adminListCourses = async (): Promise<Course[]> => {
  return listAllCourses();
};

export const adminGetCourse = async (courseId: string): Promise<Course | null> => {
  return fetchCourse(courseId);
};

export const adminCreateCourse = async (course: Partial<Course>) => {
  return saveCourse({ ...course, published: course.published ?? false });
};

export const adminUpdateCourse = async (courseId: string, patch: Partial<Course>) => {
  await updateDoc(doc(db, "courses", courseId), { ...patch, updatedAt: serverTimestamp() });
};

export const fetchModules = async (courseId: string): Promise<Module[]> => {
  try {
    const q = query(collection(db, "modules"), where("courseId", "==", courseId), orderBy("order", "asc"));
    console.info("[firestore] fetchModules query", { path: "modules", courseId });
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc<Module>(d));
  } catch (err) {
    console.error("[firestore] fetchModules error", { courseId, err });
    throw err;
  }
};

export const saveModule = async (module: Partial<Module> & { courseId: string; id?: string }) => {
  if (module.id) {
    await updateDoc(doc(db, "modules", module.id), { ...module, updatedAt: serverTimestamp() });
    return module.id;
  }
  const ref = await addDoc(collection(db, "modules"), { ...module, createdAt: serverTimestamp() });
  return ref.id;
};

export const adminListModules = async (courseId: string): Promise<Module[]> => {
  return fetchModules(courseId);
};

export const adminCreateModule = async (module: Partial<Module> & { courseId: string }) => {
  return saveModule(module);
};

export const adminUpdateModule = async (moduleId: string, patch: Partial<Module>) => {
  await updateDoc(doc(db, "modules", moduleId), { ...patch, updatedAt: serverTimestamp() });
};

export const adminDeleteModule = async (moduleId: string) => {
  await deleteDoc(doc(db, "modules", moduleId));
};

export const fetchLessonsForModule = async (moduleId: string, courseId: string): Promise<Lesson[]> => {
  if (!courseId) {
    console.warn("[firestore] fetchLessonsForModule skipped: missing courseId", { moduleId, courseId });
    return [];
  }
  try {
    const q = query(
      collection(db, "lessons"),
      where("moduleId", "==", moduleId),
      where("courseId", "==", courseId),
      orderBy("order", "asc"),
    );
    console.info("[firestore] fetchLessonsForModule query", { path: "lessons", moduleId, courseId });
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc<Lesson>(d));
  } catch (err) {
    console.error("[firestore] fetchLessonsForModule error", { moduleId, courseId, err });
    throw err;
  }
};

export const fetchLesson = async (lessonId: string): Promise<Lesson | null> => {
  try {
    console.info("[firestore] fetchLesson doc", { path: "lessons", lessonId });
    const snap = await getDoc(doc(db, "lessons", lessonId));
    if (!snap.exists()) return null;
    return mapDoc<Lesson>(snap);
  } catch (err) {
    console.error("[firestore] fetchLesson error", { lessonId, err });
    throw err;
  }
};

export const saveLesson = async (lesson: Partial<Lesson> & { moduleId: string; courseId: string; id?: string }) => {
  const payload = { ...lesson, courseId: lesson.courseId };
  if (lesson.id) {
    await updateDoc(doc(db, "lessons", lesson.id), { ...payload, updatedAt: serverTimestamp() });
    return lesson.id;
  }
  const ref = await addDoc(collection(db, "lessons"), { ...payload, createdAt: serverTimestamp() });
  return ref.id;
};

export const adminListLessonsForModule = async (courseId: string, moduleId: string): Promise<Lesson[]> => {
  return fetchLessonsForModule(moduleId, courseId);
};

export const adminCreateLesson = async (lesson: Partial<Lesson> & { courseId: string; moduleId: string }) => {
  return saveLesson(lesson);
};

export const adminUpdateLesson = async (lessonId: string, patch: Partial<Lesson>) => {
  await updateDoc(doc(db, "lessons", lessonId), { ...patch, updatedAt: serverTimestamp() });
};

export const adminDeleteLesson = async (lessonId: string) => {
  await deleteDoc(doc(db, "lessons", lessonId));
};

export const swapOrder = async (
  collectionName: "modules" | "lessons",
  first: { id: string; order: number },
  second: { id: string; order: number },
) => {
  // Swap order values for simple up/down actions.
  await Promise.all([
    updateDoc(doc(db, collectionName, first.id), { order: second.order, updatedAt: serverTimestamp() }),
    updateDoc(doc(db, collectionName, second.id), { order: first.order, updatedAt: serverTimestamp() }),
  ]);
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

export const getEnrollment = async (
  uid: string,
  courseId: string,
): Promise<{ hasAccess: boolean; enrollment?: Enrollment }> => {
  const q = query(
    collection(db, "enrollments"),
    where("uid", "==", uid),
    where("courseId", "==", courseId),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return { hasAccess: false };
  const enrollment = mapDoc<Enrollment>(snap.docs[0]);
  const status = (enrollment as { status?: string }).status;
  const paid = (enrollment as { paid?: boolean }).paid;
  const hasAccess = status ? status === "active" || paid === true : true;
  return { hasAccess, enrollment };
};

export const listEnrollments = async (uid: string): Promise<Enrollment[]> => {
  const q = query(collection(db, "enrollments"), where("uid", "==", uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Enrollment>(d));
};

export const getMyEnrollment = async (uid: string, courseId: string): Promise<Enrollment | null> => {
  const q = query(collection(db, "enrollments"), where("uid", "==", uid), where("courseId", "==", courseId), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapDoc<Enrollment>(snap.docs[0]);
};

export const listMyEnrollments = async (uid: string): Promise<Enrollment[]> => {
  return listEnrollments(uid);
};

export const createEnrollment = async (uid: string, courseId: string) => {
  const enrollmentId = `${uid}_${courseId}`;
  await setDoc(doc(db, "enrollments", enrollmentId), {
    uid,
    courseId,
    status: "active",
    createdAt: serverTimestamp(),
  });
  return enrollmentId;
};

export const listPayments = async (opts: { uid?: string; status?: PaymentStatus } = {}): Promise<Payment[]> => {
  const constraints = [];
  if (opts.uid) constraints.push(where("uid", "==", opts.uid));
  if (opts.status) constraints.push(where("status", "==", opts.status));
  const q = query(collection(db, "payments"), ...constraints, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Payment>(d));
};

export const getPaymentForCourse = async (uid: string, courseId: string): Promise<Payment | null> => {
  const q = query(
    collection(db, "payments"),
    where("uid", "==", uid),
    where("courseId", "==", courseId),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapDoc<Payment>(snap.docs[0]);
};

export const getPaymentId = (uid: string, courseId: string) => `${uid}_${courseId}`;

export const getExistingPayment = async (uid: string, courseId: string): Promise<Payment | null> => {
  return getPaymentForCourse(uid, courseId);
};

export const createPayment = async (
  payment: Omit<Payment, "id" | "status" | "createdAt" | "updatedAt"> & { status?: PaymentStatus },
) => {
  const isDev = process.env.NODE_ENV !== "production";
  const paymentId = getPaymentId(payment.uid, payment.courseId);
  // Guard against duplicate payments for the same user/course.
  const paymentRef = doc(db, "payments", paymentId);
  const enrollment = await getActiveEnrollment(payment.uid, payment.courseId);
  if (enrollment?.status === "active") {
    if (isDev) console.info("[payments] blocked: active enrollment", { paymentId });
    throw new Error("ALREADY_PURCHASED");
  }

  const existingSnap = await getDoc(paymentRef);
  const existing = existingSnap.exists() ? mapDoc<Payment>(existingSnap) : null;
  if (existing && (existing.status === "submitted" || existing.status === "confirmed")) {
    if (isDev) console.info("[payments] blocked: existing payment", { paymentId, status: existing.status });
    throw new Error("PAYMENT_EXISTS");
  }

  if (existing) {
    // Idempotent create: return the deterministic id if a prior attempt exists.
    return paymentId;
  }

  await setDoc(paymentRef, {
    ...payment,
    // "submitted" is treated as the pending status in this app.
    status: payment.status ?? "submitted",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return paymentId;
};

export const createPendingPayment = async (uid: string, courseId: string) => {
  const ref = await addDoc(collection(db, "payments"), {
    uid,
    courseId,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const createPaymentRequest = async (uid: string, courseId: string, amount: number) => {
  const ref = await addDoc(collection(db, "payments"), {
    uid,
    courseId,
    amount,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updatePaymentStatus = async (paymentId: string, status: PaymentStatus) => {
  await updateDoc(doc(db, "payments", paymentId), { status, updatedAt: serverTimestamp() });
};

export const adminListPaymentsByStatus = async (status?: "pending" | "approved" | "rejected") => {
  const constraints = [];
  if (status) constraints.push(where("status", "==", status));
  const q = query(collection(db, "payments"), ...constraints, orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc<Payment>(d));
};

export const adminGrantEnrollment = async (uid: string, courseId: string) => {
  const existing = await getMyEnrollment(uid, courseId);
  if (existing) return existing.id;
  const enrollmentId = `${uid}_${courseId}`;
  await setDoc(doc(db, "enrollments", enrollmentId), {
    uid,
    courseId,
    status: "active",
    createdAt: serverTimestamp(),
  });
  return enrollmentId;
};

export const adminMarkPaymentPaid = async (paymentId: string) => {
  const snap = await getDoc(doc(db, "payments", paymentId));
  if (!snap.exists()) return;
  const payment = mapDoc<Payment>(snap);
  await updateDoc(doc(db, "payments", paymentId), { status: "approved", updatedAt: serverTimestamp() });
  await adminGrantEnrollment(payment.uid, payment.courseId);
};

export const uploadPaymentProof = async (uid: string, paymentId: string, file: File) => {
  const path = `payments/${uid}/${paymentId}/proof`;
  const url = await uploadFile(path, file, { contentType: file.type });
  await updateDoc(doc(db, "payments", paymentId), { proofUrl: url, updatedAt: serverTimestamp() });
  return url;
};

export const subscribeToPayment = (paymentId: string, cb: (payment: Payment | null) => void) => {
  console.info("[firestore] subscribeToPayment", { paymentId });
  return onSnapshot(
    doc(db, "payments", paymentId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(mapDoc<Payment>(snap));
    },
    (err) => {
      console.error("[firestore] subscribeToPayment error", { paymentId, err });
    },
  );
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

export const getAssignmentByLesson = async (lessonId: string, courseId?: string): Promise<Assignment | null> => {
  try {
    if (courseId) {
      const q = query(
        collection(db, "assignments"),
        where("lessonId", "==", lessonId),
        where("courseId", "==", courseId),
        limit(1),
      );
      console.info("[firestore] getAssignmentByLesson query", { path: "assignments", lessonId, courseId });
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return mapDoc<Assignment>(snap.docs[0]);
    }
    const q = query(collection(db, "assignments"), where("lessonId", "==", lessonId), limit(1));
    console.info("[firestore] getAssignmentByLesson query", { path: "assignments", lessonId });
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapDoc<Assignment>(snap.docs[0]);
  } catch (err) {
    console.error("[firestore] getAssignmentByLesson error", { lessonId, courseId, err });
    throw err;
  }
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
  try {
    const snap = await getDocs(query(collection(db, "submissions"), orderBy("submittedAt", "desc")));
    return snap.docs.map((d) => mapDoc<Submission>(d));
  } catch (err) {
    console.error("[firestore] listSubmissions error", { err });
    throw err;
  }
};

export const listPendingSubmissions = async (limitCount = 50): Promise<Submission[]> => {
  try {
    const q = query(
      collection(db, "submissions"),
      where("checkedAt", "==", null),
      orderBy("submittedAt", "desc"),
      limit(limitCount),
    );
    console.info("[firestore] listPendingSubmissions", { limit: limitCount });
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapDoc<Submission>(d));
  } catch (err) {
    console.error("[firestore] listPendingSubmissions error", { err });
    throw err;
  }
};

export const listSubmissionsForCourse = async (
  courseId: string,
  opts: { pendingOnly?: boolean; limit?: number } = {},
): Promise<Submission[]> => {
  try {
    const constraints = [where("courseId", "==", courseId), orderBy("submittedAt", "desc")];
    if (opts.pendingOnly) {
      constraints.unshift(where("checkedAt", "==", null));
    }
    if (opts.limit) {
      constraints.push(limit(opts.limit));
    }
    console.info("[firestore] listSubmissionsForCourse", { courseId, pendingOnly: !!opts.pendingOnly, limit: opts.limit });
    const snap = await getDocs(query(collection(db, "submissions"), ...constraints));
    return snap.docs.map((d) => mapDoc<Submission>(d));
  } catch (err) {
    console.error("[firestore] listSubmissionsForCourse error", { courseId, err });
    throw err;
  }
};

export const subscribeToPendingSubmissions = (
  cb: (submissions: Submission[]) => void,
  limitCount = 50,
) => {
  const q = query(
    collection(db, "submissions"),
    where("checkedAt", "==", null),
    orderBy("submittedAt", "desc"),
    limit(limitCount),
  );
  console.info("[firestore] subscribeToPendingSubmissions", { limit: limitCount });
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => mapDoc<Submission>(d)));
    },
    (err) => {
      console.error("[firestore] subscribeToPendingSubmissions error", { err });
    },
  );
};

export const subscribeToCourseSubmissions = (
  courseId: string,
  cb: (submissions: Submission[]) => void,
  opts: { pendingOnly?: boolean } = {},
) => {
  const constraints = [where("courseId", "==", courseId), orderBy("submittedAt", "desc")];
  if (opts.pendingOnly) {
    constraints.unshift(where("checkedAt", "==", null));
  }
  console.info("[firestore] subscribeToCourseSubmissions", { courseId, pendingOnly: !!opts.pendingOnly });
  return onSnapshot(
    query(collection(db, "submissions"), ...constraints),
    (snap) => {
      cb(snap.docs.map((d) => mapDoc<Submission>(d)));
    },
    (err) => {
      console.error("[firestore] subscribeToCourseSubmissions error", { courseId, err });
    },
  );
};

export const fetchSubmission = async (submissionId: string): Promise<Submission | null> => {
  try {
    console.info("[firestore] fetchSubmission doc", { path: "submissions", submissionId });
    const snap = await getDoc(doc(db, "submissions", submissionId));
    if (!snap.exists()) return null;
    return mapDoc<Submission>(snap);
  } catch (err) {
    console.error("[firestore] fetchSubmission error", { submissionId, err });
    throw err;
  }
};

export const subscribeToUserSubmission = (
  assignmentId: string,
  uid: string,
  cb: (submission: Submission | null) => void,
) => {
  const q = query(
    collection(db, "submissions"),
    where("assignmentId", "==", assignmentId),
    where("uid", "==", uid),
    limit(1),
  );
  console.info("[firestore] subscribeToUserSubmission", { assignmentId, uid });
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        cb(null);
        return;
      }
      cb(mapDoc<Submission>(snap.docs[0]));
    },
    (err) => {
      console.error("[firestore] subscribeToUserSubmission error", { assignmentId, uid, err });
    },
  );
};

export const updateSubmissionFeedback = async (submissionId: string, feedback: string, grade?: number, checkedBy?: string) => {
  await updateDoc(doc(db, "submissions", submissionId), {
    feedback,
    grade: grade ?? null,
    checkedBy: checkedBy ?? null,
    checkedAt: serverTimestamp(),
  });
};

export const addLessonAttachment = async ({
  courseId,
  lessonId,
  file,
}: {
  courseId: string;
  lessonId: string;
  file: File;
}) => {
  const url = await uploadFile(`attachments/${courseId}/${lessonId}/${file.name}`, file);
  await updateDoc(doc(db, "lessons", lessonId), {
    attachments: arrayUnion({ name: file.name, url }),
    updatedAt: serverTimestamp(),
  });
  return url;
};

export const removeLessonAttachment = async (lessonId: string, attachment: { name: string; url: string }) => {
  await updateDoc(doc(db, "lessons", lessonId), {
    attachments: arrayRemove(attachment),
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToLessonProgress = (uid: string, lessonId: string, cb: (progress: Progress | null) => void) => {
  console.info("[firestore] subscribeToLessonProgress", { uid, lessonId });
  return onSnapshot(
    doc(db, "users", uid, "progress", lessonId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(mapDoc<Progress>(snap));
    },
    (err) => {
      console.error("[firestore] subscribeToLessonProgress error", { uid, lessonId, err });
    },
  );
};

export const markLessonOpened = async (uid: string, courseId: string, lessonId: string) => {
  await setDoc(
    doc(db, "users", uid, "progress", lessonId),
    {
      uid,
      courseId,
      lessonId,
      status: "in_progress",
      lastOpenedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const markLessonCompleted = async (uid: string, courseId: string, lessonId: string) => {
  await setDoc(
    doc(db, "users", uid, "progress", lessonId),
    {
      uid,
      courseId,
      lessonId,
      status: "completed",
      completedAt: serverTimestamp(),
      lastOpenedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const listProgressForCourse = async (uid: string, courseId: string): Promise<Progress[]> => {
  const snap = await getDocs(query(collection(db, "users", uid, "progress"), where("courseId", "==", courseId)));
  return snap.docs.map((d) => mapDoc<Progress>(d));
};

export const getCourseProgress = async (uid: string, courseId: string): Promise<Progress[]> => {
  return listProgressForCourse(uid, courseId);
};

export const getLessonProgress = async (uid: string, lessonId: string): Promise<Progress | null> => {
  const snap = await getDoc(doc(db, "users", uid, "progress", lessonId));
  if (!snap.exists()) return null;
  return mapDoc<Progress>(snap);
};

export const setLessonCompleted = async (uid: string, courseId: string, lessonId: string, completed = true) => {
  const progressId = `${uid}_${courseId}`;
  await setDoc(
    doc(db, "progress", progressId),
    {
      uid,
      courseId,
      completedLessons: completed ? arrayUnion(lessonId) : arrayRemove(lessonId),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const getUserCourseProgress = async (
  uid: string,
  courseId: string,
): Promise<{ uid: string; courseId: string; completedLessons: string[] }> => {
  const progressId = `${uid}_${courseId}`;
  const snap = await getDoc(doc(db, "progress", progressId));
  if (!snap.exists()) {
    return { uid, courseId, completedLessons: [] };
  }
  const data = snap.data() as { uid?: string; courseId?: string; completedLessons?: string[] };
  return {
    uid: data.uid || uid,
    courseId: data.courseId || courseId,
    completedLessons: Array.isArray(data.completedLessons) ? data.completedLessons : [],
  };
};

export const subscribeToUserCourseProgress = (
  uid: string,
  courseId: string,
  cb: (progress: { uid: string; courseId: string; completedLessons: string[] }) => void,
) => {
  const progressId = `${uid}_${courseId}`;
  console.info("[firestore] subscribeToUserCourseProgress", { uid, courseId });
  return onSnapshot(
    doc(db, "progress", progressId),
    (snap) => {
      if (!snap.exists()) {
        cb({ uid, courseId, completedLessons: [] });
        return;
      }
      const data = snap.data() as { uid?: string; courseId?: string; completedLessons?: string[] };
      cb({
        uid: data.uid || uid,
        courseId: data.courseId || courseId,
        completedLessons: Array.isArray(data.completedLessons) ? data.completedLessons : [],
      });
    },
    (err) => {
      console.error("[firestore] subscribeToUserCourseProgress error", { uid, courseId, err });
    },
  );
};

export const listMyCourses = async (uid: string): Promise<Course[]> => {
  const enrollments = await listEnrollments(uid);
  const courses: Course[] = [];
  for (const enrollment of enrollments) {
    const course = await fetchCourse(enrollment.courseId);
    if (course) courses.push(course);
  }
  return courses;
};

export const fetchCourseOutline = async (courseId: string) => {
  const course = await fetchCourse(courseId);
  const modules = await fetchModules(courseId);
  const lessonsByModule: Record<string, Lesson[]> = {};
  for (const mod of modules) {
    lessonsByModule[mod.id] = await fetchLessonsForModule(mod.id, courseId);
  }
  return { course, modules, lessonsByModule };
};
