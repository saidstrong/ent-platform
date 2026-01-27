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
  courseId?: string;
  order: number;
  type: LessonType;
  title_kz: string;
  title_en: string;
  content_kz?: string;
  content_en?: string;
  videoUrl?: string;
  attachments?: { name: string; url: string }[];
  resources?: LessonResource[];
  createdAt?: string;
}

export type LessonResource = {
  id: string;
  kind: "file" | "link" | "youtube" | "note";
  name: string;
  url?: string;
  downloadUrl?: string;
  storagePath?: string;
  contentType?: string;
  size?: number;
  text?: string;
  createdAt?: string;
};

export type QuizQuestionType = "single" | "multi" | "short" | "match";

export type QuizOption = {
  id: string;
  text_kz: string;
  text_en: string;
  imageUrl?: string;
};

export type QuizMatchItem = {
  id: string;
  text_kz: string;
  text_en: string;
};

export type QuizQuestionBase = {
  id: string;
  order: number;
  type: QuizQuestionType;
  prompt_kz: string;
  prompt_en: string;
  imageUrl?: string;
  points: number;
  explanation_kz?: string;
  explanation_en?: string;
};

export type QuizQuestionSingle = QuizQuestionBase & {
  type: "single";
  options: QuizOption[];
  correctOptionId: string;
};

export type QuizQuestionMulti = QuizQuestionBase & {
  type: "multi";
  options: QuizOption[];
  correctOptionIds: string[];
};

export type QuizQuestionShort = QuizQuestionBase & {
  type: "short";
  acceptedAnswers: string[];
  caseSensitive: boolean;
  trim: boolean;
};

export type QuizQuestionMatch = QuizQuestionBase & {
  type: "match";
  left: QuizMatchItem[];
  right: QuizMatchItem[];
  correctPairs: { leftId: string; rightId: string }[];
};

export type QuizQuestion = QuizQuestionSingle | QuizQuestionMulti | QuizQuestionShort | QuizQuestionMatch;

export type QuizSettings = {
  shuffleQuestions?: boolean;
};

export type Quiz = {
  id: string;
  courseId: string;
  lessonId: string;
  schemaVersion: number;
  title_kz: string;
  title_en: string;
  passPercent: number;
  settings?: QuizSettings;
  questions: QuizQuestion[];
  createdAt?: string;
  updatedAt?: string;
};

export type QuizAnswer =
  | { type: "single"; optionId: string | null }
  | { type: "multi"; optionIds: string[] }
  | { type: "short"; value: string }
  | { type: "match"; pairs: Record<string, string> };

export type QuizQuestionResult = {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  isCorrect: boolean;
};

export type QuizAttempt = {
  id: string;
  uid: string;
  courseId: string;
  lessonId: string;
  answers: Record<string, QuizAnswer>;
  results: QuizQuestionResult[];
  pointsEarned: number;
  pointsMax: number;
  percent: number;
  submittedAt?: string;
  updatedAt?: string;
};

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
  createdAt: unknown;
  proofUrl?: string;
  proofPath?: string;
  reviewedAt?: unknown;
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
  lessonId?: string;
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
