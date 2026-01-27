'use client';

import {
  addDoc,
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  arrayUnion,
  arrayRemove,
  type QueryConstraint,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { STORAGE_PREFIXES, uploadFile, uploadLessonAttachment } from "./storage";
import { listenWithTag } from "./listeners";
import type {
  Assignment,
  Course,
  Enrollment,
  Lesson,
  Module,
  Payment,
  PaymentStatus,
  Submission,
  UserProfile,
  Progress,
  LessonResource,
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizOption,
  QuizQuestion,
  QuizQuestionResult,
} from "./types";

const mapDoc = <T extends { id: string }>(snap: DocumentSnapshot<DocumentData>): T =>
  ({
    id: snap.id,
    ...(snap.data() as Omit<T, "id">),
  }) as T;

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

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

export const fetchUserProfile = async (uid: string): Promise<UserProfile | null> => {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as UserProfile;
  return { ...data, uid: data.uid || uid };
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

export const getCourseAccessState = async (
  uid: string,
  courseId: string,
): Promise<{
  state: "enrolled" | "pending" | "approved_waiting_enrollment" | "none";
  enrollment: Enrollment | null;
  payment: Payment | null;
  paymentId?: string;
}> => {
  const enrollmentSnap = await getDocs(
    query(collection(db, "enrollments"), where("uid", "==", uid), where("courseId", "==", courseId), limit(1)),
  );
  if (!enrollmentSnap.empty) {
    const enrollment = mapDoc<Enrollment>(enrollmentSnap.docs[0]);
    const status = (enrollment as { status?: string }).status;
    if (!status || status === "active") {
      return { state: "enrolled", enrollment, payment: null };
    }
  }

  const paymentQuery = query(
    collection(db, "payments"),
    where("uid", "==", uid),
    where("courseId", "==", courseId),
    where("status", "in", ["pending", "approved", "confirmed"]),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  const paymentSnap = await getDocs(paymentQuery);
  if (paymentSnap.empty) return { state: "none", enrollment: null, payment: null };

  const payment = normalizePayment(mapDoc<Payment>(paymentSnap.docs[0]));
  if (payment.status === "pending") {
    return { state: "pending", paymentId: payment.id, enrollment: null, payment };
  }
  if (payment.status === "approved") {
    return { state: "approved_waiting_enrollment", paymentId: payment.id, enrollment: null, payment };
  }
  return { state: "none", paymentId: payment.id, enrollment: null, payment };
};

export const ensureEnrollment = async (uid: string, courseId: string) => {
  const enrollmentSnap = await getDocs(
    query(collection(db, "enrollments"), where("uid", "==", uid), where("courseId", "==", courseId), limit(1)),
  );
  if (!enrollmentSnap.empty) return;

  const paymentQuery = query(
    collection(db, "payments"),
    where("uid", "==", uid),
    where("courseId", "==", courseId),
    where("status", "in", ["approved", "confirmed"]),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  const paymentSnap = await getDocs(paymentQuery);
  if (paymentSnap.empty) return;

  await addDoc(collection(db, "enrollmentRequests"), {
    uid,
    courseId,
    createdAt: serverTimestamp(),
  });
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

const normalizePayment = (payment: Payment): Payment => {
  const rawStatus = (payment.status as string) ?? "pending";
  const status =
    rawStatus === "approved" || rawStatus === "confirmed" || rawStatus === "rejected"
      ? (rawStatus === "confirmed" ? "approved" : rawStatus)
      : "pending";
  return {
    ...payment,
    status,
    createdAt: payment.createdAt ?? null,
  };
};

export const listPayments = async (opts: { uid?: string; status?: PaymentStatus } = {}): Promise<Payment[]> => {
  const constraints = [];
  if (opts.uid) constraints.push(where("uid", "==", opts.uid));
  if (opts.status === "approved") {
    constraints.push(where("status", "in", ["approved", "confirmed"]));
  } else if (opts.status) {
    constraints.push(where("status", "==", opts.status));
  }
  const q = query(collection(db, "payments"), ...constraints, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizePayment(mapDoc<Payment>(d)));
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
  return normalizePayment(mapDoc<Payment>(snap.docs[0]));
};

type CreatePaymentPayload = Omit<Payment, "id" | "status" | "createdAt"> & { status?: PaymentStatus };

export const getPaymentId = (uid: string, courseId: string) => `${uid}_${courseId}`;

export function createPayment(payment: CreatePaymentPayload): Promise<{
  state: "enrolled" | "pending" | "approved_waiting_enrollment" | "none";
  paymentId?: string;
  enrollment?: Enrollment | null;
  payment?: Payment | null;
}>;
export function createPayment(uid: string, courseId: string): Promise<{
  state: "enrolled" | "pending" | "approved_waiting_enrollment" | "none";
  paymentId?: string;
  enrollment?: Enrollment | null;
  payment?: Payment | null;
}>;
export async function createPayment(
  paymentOrUid: CreatePaymentPayload | string,
  courseId?: string,
): Promise<{
  state: "enrolled" | "pending" | "approved_waiting_enrollment" | "none";
  paymentId?: string;
  enrollment?: Enrollment | null;
  payment?: Payment | null;
}> {
  const payment =
    typeof paymentOrUid === "string"
      ? ({ uid: paymentOrUid, courseId } as CreatePaymentPayload)
      : paymentOrUid;
  if (!payment.uid || !payment.courseId) {
    throw new Error("Missing uid or courseId for payment.");
  }
  if (process.env.NODE_ENV !== "production") {
    console.debug("[createPayment] start", { uid: payment.uid, courseId: payment.courseId });
  }

  const existingQuery = query(
    collection(db, "payments"),
    where("uid", "==", payment.uid),
    where("courseId", "==", payment.courseId),
    where("status", "in", ["pending", "approved", "confirmed"]),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  if (process.env.NODE_ENV !== "production") {
    console.info("[payments] precheck", {
      stage: "payments:precheck",
      uid: payment.uid,
      courseId: payment.courseId,
      statuses: ["pending", "approved", "confirmed"],
      constraints: ["uid == currentUser", "courseId == currentCourse", "status in pending/approved/confirmed", "orderBy createdAt desc", "limit 1"],
    });
  }
  let existingSnap;
  try {
    existingSnap = await getDocs(existingQuery);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      const error = err as { code?: string; message?: string };
      console.error("[payments] precheck error", {
        stage: "payments:precheck:error",
        code: error.code,
        message: error.message,
      });
    }
    throw err;
  }
  if (!existingSnap.empty) {
    const existing = normalizePayment(mapDoc<Payment>(existingSnap.docs[0]));
    if (existing.status === "pending") {
      return { state: "pending", paymentId: existing.id, payment: existing, enrollment: null };
    }
    if (existing.status === "approved") {
      return { state: "approved_waiting_enrollment", paymentId: existing.id, payment: existing, enrollment: null };
    }
  }

  const payload = {
    ...payment,
    status: payment.status ?? "pending",
    createdAt: serverTimestamp(),
  };
  if (process.env.NODE_ENV !== "production") {
    const allowedKeys = new Set(["uid", "courseId", "status", "createdAt", "note"]);
    const keys = Object.keys(payload);
    const describe = (value: unknown) => {
      if (value === null) return "null";
      if (typeof value === "object" && value !== null && "toDate" in (value as { toDate?: unknown })) return "Timestamp";
      return typeof value;
    };
    console.info("[payments] create payload", {
      op: "addDoc",
      path: "payments (auto-id)",
      keys,
      types: Object.fromEntries(keys.map((key) => [key, describe((payload as Record<string, unknown>)[key])])),
      uid: payment.uid,
    });
    const disallowed = keys.filter((key) => !allowedKeys.has(key));
    if (!payment.uid || !payment.courseId || disallowed.length > 0) {
      console.error("[payments] create payload invalid", {
        uid: payment.uid || null,
        courseId: payment.courseId || null,
        disallowedKeys: disallowed,
      });
    }
  }
  let createdRef;
  try {
    createdRef = await addDoc(collection(db, "payments"), payload);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      const error = err as { code?: string; message?: string };
      console.error("[payments] addDoc error", {
        stage: "payments:addDoc:error",
        code: error.code,
        message: error.message,
      });
    }
    throw err;
  }
  return { state: "pending", paymentId: createdRef.id };
}

export const adminListPaymentsByStatus = async (status?: PaymentStatus) => {
  const constraints = [];
  if (status === "approved") {
    constraints.push(where("status", "in", ["approved", "confirmed"]));
  } else if (status) {
    constraints.push(where("status", "==", status));
  }
  const q = query(collection(db, "payments"), ...constraints, orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizePayment(mapDoc<Payment>(d)));
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

export const adminReviewPayment = async (paymentId: string, status: PaymentStatus, reviewerUid: string, note?: string) => {
  await updateDoc(doc(db, "payments", paymentId), {
    status,
    reviewedAt: serverTimestamp(),
    reviewerUid,
    ...(note ? { note } : {}),
  });
};

export const uploadPaymentProof = async (uid: string, paymentId: string, file: File) => {
  const path = `payments/${uid}/${paymentId}/proof`;
  const url = await uploadFile(path, file, { contentType: file.type });
  if (process.env.NODE_ENV !== "production") {
    console.info("[payments] proof update", { path: `payments/${paymentId}`, keys: ["proofUrl", "proofPath", "updatedAt"] });
  }
  await updateDoc(doc(db, "payments", paymentId), { proofUrl: url, proofPath: path, updatedAt: serverTimestamp() });
  return { url, path };
};

export const subscribeToPayment = (
  paymentId: string,
  uid: string,
  cb: (payment: Payment | null) => void,
  tag = "payments:subscribe",
  meta: { role?: string | null; route?: string } = {},
) => {
  if (!paymentId || !uid) {
    cb(null);
    return () => {};
  }
  if (process.env.NODE_ENV !== "production") {
    console.info("[firestore] subscribeToPayment query", { tag, path: "payments", uid, paymentId });
  }
  const q = query(
    collection(db, "payments"),
    where("uid", "==", uid),
    where(documentId(), "==", paymentId),
    limit(1),
  );
  return listenWithTag(
    tag,
    q,
    (snap) => {
      if (snap.empty) {
        cb(null);
        return;
      }
      cb(normalizePayment(mapDoc<Payment>(snap.docs[0])));
    },
    (err) => {
      console.error("[firestore] subscribeToPayment error", { tag, paymentId, uid, err });
    },
    {
      uid,
      role: meta.role ?? null,
      route: meta.route,
      path: "payments",
      desc: "payments query: uid == currentUser && documentId == paymentId",
      constraints: [
        { field: "uid", op: "==", value: uid },
        { field: "__name__", op: "==", value: paymentId },
      ],
    },
  );
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
  if (!submission.uid || !submission.assignmentId) {
    throw new Error("Missing required submission fields.");
  }
  let courseId = submission.courseId;
  let lessonId = submission.lessonId;
  if (!courseId || !lessonId) {
    const assignmentSnap = await getDoc(doc(db, "assignments", submission.assignmentId));
    if (assignmentSnap.exists()) {
      const assignment = assignmentSnap.data() as { courseId?: string; lessonId?: string };
      courseId = courseId || assignment.courseId;
      lessonId = lessonId || assignment.lessonId;
    }
  }
  if (!courseId || !lessonId) {
    throw new Error("Missing course or lesson info for submission.");
  }
  const ref = await addDoc(collection(db, "submissions"), {
    ...submission,
    courseId,
    lessonId,
    submittedAt: serverTimestamp(),
  });
  return ref.id;
};

export const submitAssignmentText = async ({
  uid,
  assignmentId,
  courseId,
  lessonId,
  textAnswer,
}: {
  uid: string;
  assignmentId: string;
  courseId: string;
  lessonId: string;
  textAnswer: string;
}) => {
  return submitAssignment({
    uid,
    assignmentId,
    courseId,
    lessonId,
    textAnswer,
  });
};

export const updateSubmissionContent = async (submissionId: string, patch: {
  textAnswer?: string;
  submittedAt?: unknown;
}) => {
  await updateDoc(doc(db, "submissions", submissionId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
};

export const uploadAssignmentFile = async ({
  uid,
  assignmentId,
  submissionId,
  file,
}: {
  uid: string;
  assignmentId: string;
  submissionId: string;
  file: File;
}) => {
  const filename = `${Date.now()}_${file.name}`;
  const path = `submissions/${uid}/${assignmentId}/${filename}`;
  const url = await uploadFile(path, file, { contentType: file.type });
  await updateDoc(doc(db, "submissions", submissionId), {
    fileUrl: url,
    filePath: path,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    contentType: file.type,
    updatedAt: serverTimestamp(),
  });
  return { url, path };
};

type LegacyQuizQuestion = {
  id?: string;
  prompt_kz?: string;
  prompt_en?: string;
  options_kz?: string[];
  options_en?: string[];
  correctIndex?: number;
  explanation_kz?: string;
  explanation_en?: string;
};

const normalizeQuizOptions = (optionsKz: string[] = [], optionsEn: string[] = []): QuizOption[] => {
  const max = Math.max(optionsKz.length, optionsEn.length);
  const options: QuizOption[] = [];
  for (let i = 0; i < max; i += 1) {
    options.push({
      id: createId(),
      text_kz: optionsKz[i] ?? "",
      text_en: optionsEn[i] ?? optionsKz[i] ?? "",
    });
  }
  return options;
};

const normalizeQuizQuestion = (question: QuizQuestion | LegacyQuizQuestion, index: number): QuizQuestion => {
  if ("type" in question && question.type) {
    return {
      ...question,
      id: question.id || createId(),
      order: question.order ?? index + 1,
      points: question.points ?? 1,
    } as QuizQuestion;
  }
  const options = normalizeQuizOptions(question.options_kz || [], question.options_en || []);
  const correctIndex = typeof question.correctIndex === "number" ? question.correctIndex : 0;
  const correctOptionId = options[correctIndex]?.id || options[0]?.id || createId();
  return {
    id: question.id || createId(),
    order: index + 1,
    type: "single",
    prompt_kz: question.prompt_kz || "",
    prompt_en: question.prompt_en || "",
    options,
    correctOptionId,
    points: 1,
    explanation_kz: question.explanation_kz,
    explanation_en: question.explanation_en,
  };
};

const normalizeQuiz = (lessonId: string, data: DocumentData): Quiz => {
  const questionsInput = Array.isArray(data.questions) ? data.questions : [];
  const normalizedQuestions = questionsInput.map((q, idx) => normalizeQuizQuestion(q as QuizQuestion | LegacyQuizQuestion, idx));
  return {
    id: lessonId,
    courseId: data.courseId || "",
    lessonId,
    schemaVersion: data.schemaVersion ?? 2,
    title_kz: data.title_kz || "",
    title_en: data.title_en || "",
    passPercent: Number(data.passPercent ?? 70),
    settings: data.settings ?? {},
    questions: normalizedQuestions,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export const fetchQuiz = async (lessonId: string): Promise<Quiz | null> => {
  const snap = await getDoc(doc(db, "quizzes", lessonId));
  if (!snap.exists()) return null;
  return normalizeQuiz(lessonId, snap.data());
};

export const upsertQuiz = async (lessonId: string, payload: Omit<Quiz, "id" | "lessonId" | "schemaVersion"> & { lessonId?: string }) => {
  const ref = doc(db, "quizzes", lessonId);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...payload,
      lessonId,
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
};

const normalizeQuizAttempt = (attemptId: string, data: DocumentData): QuizAttempt => {
  const answers = data.answers && typeof data.answers === "object" ? data.answers : {};
  return {
    id: attemptId,
    uid: data.uid || "",
    courseId: data.courseId || "",
    lessonId: data.lessonId || "",
    answers,
    results: Array.isArray(data.results) ? data.results : [],
    pointsEarned: Number(data.pointsEarned ?? data.correctCount ?? 0),
    pointsMax: Number(data.pointsMax ?? data.total ?? 0),
    percent: Number(data.percent ?? data.scorePercent ?? 0),
    submittedAt: data.submittedAt || data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export const fetchMyQuizAttempt = async (uid: string, lessonId: string): Promise<QuizAttempt | null> => {
  const attemptId = `${uid}_${lessonId}`;
  const snap = await getDoc(doc(db, "quizAttempts", attemptId));
  if (!snap.exists()) return null;
  return normalizeQuizAttempt(attemptId, snap.data());
};

export const gradeQuizAttempt = (quiz: Quiz, answers: Record<string, QuizAnswer>) => {
  const results: QuizQuestionResult[] = [];
  let pointsEarned = 0;
  let pointsMax = 0;

  quiz.questions.forEach((question) => {
    const maxPoints = Math.max(0, Number(question.points || 0));
    pointsMax += maxPoints;
    let earned = 0;
    let isCorrect = false;
    const answer = answers[question.id];

    if (question.type === "single") {
      const selected = answer && answer.type === "single" ? answer.optionId : null;
      isCorrect = selected === question.correctOptionId;
      earned = isCorrect ? maxPoints : 0;
    }

    if (question.type === "multi") {
      const selected = answer && answer.type === "multi" ? answer.optionIds : [];
      const correctSet = new Set(question.correctOptionIds);
      const selectedSet = new Set(selected);
      let correctSelected = 0;
      let wrongSelected = 0;
      selectedSet.forEach((optionId) => {
        if (correctSet.has(optionId)) {
          correctSelected += 1;
        } else {
          wrongSelected += 1;
        }
      });
      const correctTotal = Math.max(1, question.correctOptionIds.length);
      const fraction = Math.max(0, (correctSelected - wrongSelected) / correctTotal);
      earned = Number((maxPoints * fraction).toFixed(2));
      isCorrect = earned === maxPoints;
    }

    if (question.type === "short") {
      const value = answer && answer.type === "short" ? answer.value : "";
      const normalize = (input: string) => {
        const trimmed = question.trim ? input.trim() : input;
        return question.caseSensitive ? trimmed : trimmed.toLowerCase();
      };
      const normalizedValue = normalize(value);
      const accepted = (question.acceptedAnswers || []).map((ans) => normalize(ans));
      isCorrect = accepted.includes(normalizedValue);
      earned = isCorrect ? maxPoints : 0;
    }

    if (question.type === "match") {
      const pairs = answer && answer.type === "match" ? answer.pairs : {};
      const totalPairs = Math.max(1, question.left.length);
      let correctPairs = 0;
      question.left.forEach((item) => {
        const expected = question.correctPairs.find((pair) => pair.leftId === item.id)?.rightId;
        if (expected && pairs[item.id] === expected) {
          correctPairs += 1;
        }
      });
      const fraction = correctPairs / totalPairs;
      earned = Number((maxPoints * fraction).toFixed(2));
      isCorrect = earned === maxPoints;
    }

    pointsEarned += earned;
    results.push({
      questionId: question.id,
      earnedPoints: earned,
      maxPoints,
      isCorrect,
    });
  });

  const percent = pointsMax > 0 ? Math.round((pointsEarned / pointsMax) * 100) : 0;
  return { results, pointsEarned, pointsMax, percent };
};

export const submitQuizAttempt = async ({
  uid,
  lessonId,
  courseId,
  answers,
}: {
  uid: string;
  lessonId: string;
  courseId: string;
  answers: Record<string, QuizAnswer>;
}): Promise<QuizAttempt> => {
  // Store the latest attempt per user/lesson in quizAttempts/{uid}_{lessonId}.
  const attemptId = `${uid}_${lessonId}`;
  const existing = await getDoc(doc(db, "quizAttempts", attemptId));
  if (existing.exists()) {
    return normalizeQuizAttempt(attemptId, existing.data());
  }
  const quiz = await fetchQuiz(lessonId);
  if (!quiz) {
    throw new Error("Quiz not found.");
  }
  const { results, pointsEarned, pointsMax, percent } = gradeQuizAttempt(quiz, answers);
  const attempt: Omit<QuizAttempt, "id"> = {
    uid,
    lessonId,
    courseId,
    answers,
    results,
    pointsEarned,
    pointsMax,
    percent,
    submittedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, "quizAttempts", attemptId), {
    ...attempt,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: attemptId, ...attempt };
};

export const listQuizAttemptsForCourse = async (courseId?: string, limitCount = 50): Promise<QuizAttempt[]> => {
  const constraints: QueryConstraint[] = [orderBy("submittedAt", "desc")];
  if (courseId) {
    constraints.unshift(where("courseId", "==", courseId));
  }
  if (limitCount) {
    constraints.push(limit(limitCount));
  }
  const snap = await getDocs(query(collection(db, "quizAttempts"), ...constraints));
  return snap.docs.map((docSnap) => normalizeQuizAttempt(docSnap.id, docSnap.data()));
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

export const listSubmissionsForReview = async (opts: {
  status?: "pending" | "checked" | "all";
  courseId?: string;
  limit?: number;
} = {}): Promise<Submission[]> => {
  const constraints: QueryConstraint[] = [orderBy("submittedAt", "desc")];
  if (opts.courseId) constraints.unshift(where("courseId", "==", opts.courseId));
  if (opts.status === "pending") {
    constraints.unshift(where("checkedAt", "==", null));
  }
  if (opts.limit) constraints.push(limit(opts.limit));
  const snap = await getDocs(query(collection(db, "submissions"), ...constraints));
  return snap.docs.map((d) => mapDoc<Submission>(d));
};

export const subscribeToSubmissionsForReview = (
  cb: (submissions: Submission[]) => void,
  opts: { limit?: number; onError?: (err: unknown) => void } = {},
) => {
  const limitCount = opts.limit ?? 100;
  const q = query(collection(db, "submissions"), orderBy("submittedAt", "desc"), limit(limitCount));
  console.info("[firestore] subscribeToSubmissionsForReview", { limit: limitCount });
  return listenWithTag(
    "submissions:review",
    q,
    (snap) => {
      cb(snap.docs.map((d: DocumentSnapshot<DocumentData>) => mapDoc<Submission>(d)));
    },
    (err) => {
      console.error("[firestore] subscribeToSubmissionsForReview error", { err });
      if (opts.onError) opts.onError(err);
    },
    {
      path: "submissions",
      desc: "submissions query: orderBy submittedAt desc, limit",
      constraints: [{ field: "submittedAt", op: "orderBy", value: "desc" }],
    },
  );
};

export const subscribeToSubmissionById = (
  submissionId: string,
  cb: (submission: Submission | null) => void,
  opts: { onError?: (err: unknown) => void } = {},
) => {
  if (!submissionId) {
    cb(null);
    return () => {};
  }
  console.info("[firestore] subscribeToSubmissionById", { submissionId });
  return listenWithTag(
    "submission:byId",
    doc(db, "submissions", submissionId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(mapDoc<Submission>(snap));
    },
    (err) => {
      console.error("[firestore] subscribeToSubmissionById error", { submissionId, err });
      if (opts.onError) opts.onError(err);
    },
    {
      path: `submissions/${submissionId}`,
      desc: "submission doc by id",
    },
  );
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
    const constraints: QueryConstraint[] = [where("courseId", "==", courseId), orderBy("submittedAt", "desc")];
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
  return listenWithTag(
    "submissions:pending",
    q,
    (snap) => {
      cb(snap.docs.map((d: DocumentSnapshot<DocumentData>) => mapDoc<Submission>(d)));
    },
    (err) => {
      console.error("[firestore] subscribeToPendingSubmissions error", { err });
    },
    {
      path: "submissions",
      desc: "submissions where checkedAt == null orderBy submittedAt desc",
      constraints: [
        { field: "checkedAt", op: "==", value: null },
        { field: "submittedAt", op: "orderBy", value: "desc" },
      ],
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
  return listenWithTag(
    "submissions:course",
    query(collection(db, "submissions"), ...constraints),
    (snap) => {
      cb(snap.docs.map((d: DocumentSnapshot<DocumentData>) => mapDoc<Submission>(d)));
    },
    (err) => {
      console.error("[firestore] subscribeToCourseSubmissions error", { courseId, err });
    },
    {
      path: "submissions",
      desc: "submissions where courseId == current course orderBy submittedAt desc",
      constraints: [
        { field: "courseId", op: "==", value: courseId },
        { field: "submittedAt", op: "orderBy", value: "desc" },
      ],
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
  uid: string,
  assignmentId: string,
  cb: (submission: Submission | null) => void,
) => {
  const q = query(
    collection(db, "submissions"),
    where("assignmentId", "==", assignmentId),
    where("uid", "==", uid),
    limit(1),
  );
  console.info("[firestore] subscribeToUserSubmission", { assignmentId, uid });
  return listenWithTag(
    "submission:byUser",
    q,
    (snap) => {
      if (snap.empty) {
        cb(null);
        return;
      }
      cb(mapDoc<Submission>(snap.docs[0] as DocumentSnapshot<DocumentData>));
    },
    (err) => {
      console.error("[firestore] subscribeToUserSubmission error", { assignmentId, uid, err });
    },
    {
      uid,
      path: "submissions",
      desc: "submissions where assignmentId == current and uid == currentUser",
      constraints: [
        { field: "assignmentId", op: "==", value: assignmentId },
        { field: "uid", op: "==", value: uid },
      ],
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

export const updateSubmissionReview = async (
  submissionId: string,
  patch: { grade?: number | null; feedback?: string; checkedAt?: unknown | null; checkedBy?: string | null },
) => {
  await updateDoc(doc(db, "submissions", submissionId), {
    ...patch,
    updatedAt: serverTimestamp(),
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
  const uploaded = await uploadLessonAttachment(courseId, lessonId, file);
  await updateDoc(doc(db, "lessons", lessonId), {
    attachments: arrayUnion({ name: uploaded.name, url: uploaded.url }),
    updatedAt: serverTimestamp(),
  });
  return uploaded.url;
};

export const removeLessonAttachment = async (lessonId: string, attachment: { name: string; url: string }) => {
  await updateDoc(doc(db, "lessons", lessonId), {
    attachments: arrayRemove(attachment),
    updatedAt: serverTimestamp(),
  });
};

export const uploadLessonResourceFile = async ({
  courseId,
  lessonId,
  file,
}: {
  courseId: string;
  lessonId: string;
  file: File;
}) => {
  const filename = `${Date.now()}_${file.name}`;
  const storagePath = `${STORAGE_PREFIXES.attachments}/${courseId}/${lessonId}/${filename}`;
  const downloadUrl = await uploadFile(storagePath, file, { contentType: file.type });
  return {
    id: createId(),
    kind: "file",
    name: file.name,
    url: downloadUrl,
    downloadUrl,
    storagePath,
    contentType: file.type,
    size: file.size,
  } as LessonResource;
};

export const addLessonResource = async (lessonId: string, resource: LessonResource) => {
  await updateDoc(doc(db, "lessons", lessonId), {
    resources: arrayUnion(resource),
    updatedAt: serverTimestamp(),
  });
};

export const removeLessonResource = async (lessonId: string, resourceId: string) => {
  const snap = await getDoc(doc(db, "lessons", lessonId));
  if (!snap.exists()) return;
  const data = snap.data() as { resources?: LessonResource[] };
  const nextResources = (data.resources || []).filter((res) => res.id !== resourceId);
  await updateDoc(doc(db, "lessons", lessonId), {
    resources: nextResources,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToLessonProgress = (uid: string, lessonId: string, cb: (progress: Progress | null) => void) => {
  console.info("[firestore] subscribeToLessonProgress", { uid, lessonId });
  return listenWithTag(
    "progress:lesson",
    doc(db, "users", uid, "progress", lessonId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(mapDoc<Progress>(snap as DocumentSnapshot<DocumentData>));
    },
    (err) => {
      console.error("[firestore] subscribeToLessonProgress error", { uid, lessonId, err });
    },
    {
      uid,
      path: `users/${uid}/progress/${lessonId}`,
      desc: "users/{uid}/progress/{lessonId}",
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

export const markLessonCompleted = async (uid: string, courseId: string, lessonId: string) => {
  return setLessonCompleted(uid, courseId, lessonId, true);
};

export const unmarkLessonCompleted = async (uid: string, courseId: string, lessonId: string) => {
  return setLessonCompleted(uid, courseId, lessonId, false);
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
  if (!uid || !courseId) {
    cb({ uid, courseId, completedLessons: [] });
    return () => {};
  }
  const currentUid = auth.currentUser?.uid || null;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[progress] subscribe", {
      currentUid,
      requestedUid: uid,
      courseId,
      path: `progress/${uid}_${courseId}`,
    });
  }
  if (currentUid && currentUid !== uid) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[progress] subscribe skipped: uid mismatch", { currentUid, requestedUid: uid, courseId });
    }
    cb({ uid, courseId, completedLessons: [] });
    return () => {};
  }
  const progressId = `${uid}_${courseId}`;
  console.info("[firestore] subscribeToUserCourseProgress", { uid, courseId });
  return listenWithTag(
    "progress:course",
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
    {
      uid,
      path: `progress/${progressId}`,
      desc: "progress/{uid}_{courseId}",
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

export const getFirstLessonId = async (courseId: string): Promise<string | null> => {
  const modules = await fetchModules(courseId);
  for (const mod of modules) {
    const lessons = await fetchLessonsForModule(mod.id, courseId);
    if (lessons[0]?.id) return lessons[0].id;
  }
  return null;
};
