export type Role = "student" | "teacher" | "admin";

export type CourseCategory = "exam" | "subject";
export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type LessonType = "video" | "text" | "quiz" | "live";
export type EnrollmentStatus = "pending" | "active" | "expired" | "refunded";
export type PaymentStatus = "created" | "submitted" | "confirmed" | "rejected" | "refunded";

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
  provider: "manual_kaspi";
  amount: number;
  status: PaymentStatus;
  proofText?: string;
  proofFileUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Assignment {
  id: string;
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
  textAnswer?: string;
  fileUrl?: string;
  submittedAt?: string;
  feedback?: string;
  grade?: number;
  checkedBy?: string;
  checkedAt?: string;
}
