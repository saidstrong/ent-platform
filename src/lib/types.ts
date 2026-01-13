export type Role = "student" | "teacher" | "admin";

export type CourseCategory = "exam" | "subject";
export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type LessonType = "video" | "text" | "quiz" | "live";
export type EnrollmentStatus = "pending" | "active" | "expired" | "refunded";
export type PaymentStatus = "pending" | "approved" | "rejected";

export type Language = "kz" | "en";

export interface UserProfile {
  uid: string;
  role: Role;
  displayName: string;
  email: string;
  phone?: string;
  createdAt?: string;
  lang?: Language;
}

export interface Course {
  id: string;
  title_kz: string;
  title_en: string;
  description_kz: string;
  description_en: string;
  category: CourseCategory;
  tags: string[];
  level: CourseLevel;
  durationWeeks: number;
  price: number;
  currency: "KZT";
  published: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Module {
  id: string;
  courseId: string;
  order: number;
  title_kz: string;
  title_en: string;
  createdAt?: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  order: number;
  type: LessonType;
  title_kz: string;
  title_en: string;
  content_kz?: string;
  content_en?: string;
  videoUrl?: string;
  attachments?: { name: string; url: string }[];
  createdAt?: string;
}

export interface Enrollment {
  id: string;
  uid: string;
  courseId: string;
  status: EnrollmentStatus;
  paidAmount?: number;
  paidAt?: string;
  accessUntil?: string;
  createdAt?: string;
}

export interface Payment {
  id: string;
  uid: string;
  courseId: string;
  status: PaymentStatus;
  createdAt: any;
  proofUrl?: string;
  proofPath?: string;
  reviewedAt?: any;
  reviewerUid?: string;
  note?: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  lessonId: string;
  title_kz: string;
  title_en: string;
  instructions_kz: string;
  instructions_en: string;
  createdAt?: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  uid: string;
  courseId?: string;
  textAnswer?: string;
  fileUrl?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  contentType?: string;
  submittedAt?: string;
  feedback?: string;
  grade?: number;
  checkedBy?: string;
  checkedAt?: string;
}

export type ProgressStatus = "in_progress" | "completed";

export interface Progress {
  id: string;
  uid: string;
  lessonId: string;
  courseId: string;
  status: ProgressStatus;
  lastOpenedAt?: string;
  completedAt?: string;
}
