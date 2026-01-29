'use client';

import { createContext, useContext, useMemo, useState } from "react";
import type { Language } from "./types";

const EN = {
  nav: {
    courses: "Courses",
    myCourses: "My courses",
    dashboard: "Dashboard",
    admin: "Admin",
    teacher: "Teacher",
    login: "Login",
    signup: "Sign up",
    logout: "Logout",
    toggleMenu: "Toggle menu",
    language: "Language",
  },
  home: {
    welcomeBadge: "Welcome to",
    heroTitle: "Online Education Center",
    heroSubtitle: "Learn at your pace with structured lessons, practical homework, and expert feedback.",
    cohortTitle: "Cohort MVP",
    cohortItems: {
      manualPayment: "Manual Kaspi payment with admin confirmation",
      homework: "Homework submissions with feedback",
      enrollmentGate: "Active enrollment gate for lesson content",
      bilingual: "Bilingual UI (KZ/EN) toggle",
    },
    publishedTitle: "Published courses",
    viewAll: "View all",
    noCourses: "No published courses yet. Add one in admin.",
    weeksLabel: "weeks",
    details: "Details",
  },
  courses: {
    label: "Courses",
    title: "Published catalog",
    subtitle: "Browse available cohorts and request access.",
    none: "No courses yet. Admin can create a published course.",
  },
  buttons: {
    browseCourses: "Browse courses",
    startLearning: "Start learning",
    getAccess: "Get access",
    submit: "Submit",
    save: "Save",
    create: "Create",
    update: "Update",
    open: "Open",
    download: "Download",
    continueLearning: "Continue learning",
    enroll: "Enroll",
    buy: "Buy",
    backToCourse: "Back to course",
    markCompleted: "Mark completed",
    completed: "Completed",
    resubmit: "Resubmit",
    openCourse: "Open course",
    goToHomework: "Go to homework",
    saveDraft: "Save draft",
    markChecked: "Mark checked",
    uncheck: "Uncheck",
  },
  auth: {
    loginTitle: "Login",
    signupTitle: "Create account",
    email: "Email",
    password: "Password",
    fullName: "Full name",
    preferredLanguage: "Preferred language",
    signingIn: "Signing in...",
    creating: "Creating...",
    noAccount: "No account?",
    haveAccount: "Already have an account?",
    signIn: "Login",
    signUp: "Sign up",
    loading: "Loading...",
  },
  course: {
    published: "Published",
    draft: "Draft",
    durationWeeks: "weeks",
    price: "Price",
    syllabus: "Syllabus",
    modules: "Modules",
    lessons: "Lessons",
    noLessons: "Course has no lessons yet.",
    accessRequired: "Access required",
    pendingReview: "Under review",
    approvedUpdating: "Approved, updating access...",
    alreadyPurchased: "Already purchased",
    startFromFirst: "Start from first lesson",
    resumeFromLast: "Resume from last lesson",
  },
  learn: {
    title: "Course overview",
    progress: "Progress",
    lessonsCompleted: "lessons completed",
    noLessons: "Course has no lessons yet.",
    selectLesson: "Select a lesson on the left to start learning.",
  },
  lesson: {
    title: "Lesson",
    resources: "Resources",
    attachments: "Attachments",
    noResources: "No resources yet.",
    yourSubmission: "Your submission",
    statusPending: "Pending review",
    statusChecked: "Checked",
    grade: "Grade",
    feedback: "Feedback",
    submittedAt: "Submitted at",
    checkedAt: "Checked at",
    checkedBy: "Checked by",
    previous: "Previous",
    next: "Next",
    noHomework: "No homework for this lesson.",
    notCompleted: "Not completed",
    loading: "Loading lesson...",
    notFound: "Lesson not found.",
    videoLink: "Video link",
    openVideo: "Open video",
    quizTitle: "Quiz",
    score: "Score",
    signInQuiz: "Please sign in to access the quiz.",
    noQuiz: "No quiz configured.",
    correct: "Correct",
    checkedLabel: "Checked",
    image: "Image",
    yourAnswer: "Your answer",
    selectMatch: "Select match",
    submitQuiz: "Submit quiz",
    quizSubmitted: "Quiz submitted.",
    submitting: "Submitting...",
    saving: "Saving...",
    completedUndo: "Completed (undo)",
    syllabusTitle: "Syllabus",
    modulesLessons: "Modules & lessons",
    openOnYouTube: "Open on YouTube",
    quizLoadFailed: "Failed to load quiz.",
    quizSubmitFailed: "Failed to submit quiz.",
  },
  assignment: {
    title: "Assignment",
    instructions: "Instructions",
    textAnswer: "Text answer",
    textAnswerPlaceholder: "Your solution...",
    attachFile: "Attach file",
    openAttachment: "Open",
    downloadAttachment: "Download",
    submitHomework: "Submit homework",
    submitting: "Submitting...",
    pendingReview: "Pending review",
    checked: "Checked",
    allowResubmit: "Resubmit",
    uploading: "Uploading...",
    submitError: "Failed to submit",
    invalidFileType: "Unsupported file type.",
    fileTooLarge: "File is too large.",
    alreadySubmitted: "You already submitted this assignment.",
    missingCourseLesson: "Missing course or lesson info. Please refresh and try again.",
    uploadDenied: "Upload failed due to insufficient permissions. Please try again or contact support.",
  },
  checkout: {
    manualPayment: "Manual payment",
    instructionsTitle: "Kaspi instructions",
    instructionsBody:
      "Pay via Kaspi to +77075214911 or to bank number 4400 4302 8060 1375 with comment {Your Name}. Upload a screenshot or enter the transaction comment so admin can confirm.",
    amount: "Amount",
    proofLabel: "Proof / comment",
    proofPlaceholder: "Kaspi comment, payer name, etc.",
    attachScreenshot: "Attach screenshot (optional)",
    underReview: "Under review. Please wait for approval.",
    approvedUpdating: "Approved, updating access...",
    submitting: "Submitting...",
    submitForReview: "Submit for review",
    signInRequired: "You must be signed in to submit a payment proof.",
    alreadyUnderReview: "Your payment is already under review.",
    alreadyOwned: "You already own this course.",
    paymentExists: "You already have a payment for this course.",
  },
  admin: {
    courses: "Courses",
    payments: "Payments",
    submissions: "Submissions",
    pending: "Pending",
    checked: "Checked",
    all: "All",
    noSubmissions: "No submissions yet.",
    noPayments: "No payments yet.",
  },
  dashboard: {
    subtitle: "Active and pending enrollments.",
    empty: "No enrollments yet.",
  },
  myCourses: {
    title: "Your enrollments",
  },
  teacher: {
    submissions: "Submissions",
    pending: "Pending",
    checked: "Checked",
    all: "All",
  },
  pdf: {
    title: "PDF preview",
    openInNewTab: "Open in new tab",
    download: "Download",
    openPdf: "Open PDF",
    openFile: "Open file",
    previewUnavailable: "Preview unavailable. Use the open link instead.",
  },
  errors: {
    accessDenied: "Access denied",
    loadFailed: "Failed to load data",
    notFound: "Not found",
    noAccess: "You do not have access to this content.",
    signInRequired: "Please sign in to continue.",
  },
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
type Dictionary = Widen<typeof EN>;

const KZ: Dictionary = {
  nav: {
    courses: "Курстар тізімі",
    myCourses: "Менің курстарым",
    dashboard: "Жеке Кабинет",
    admin: "Әкімшілік",
    teacher: "Мұғалім",
    login: "Кіру",
    signup: "Тіркелу",
    logout: "Шығу",
    toggleMenu: "Мәзірді ашу",
    language: "Тіл",
  },
  home: {
    welcomeBadge: "Қош келдіңіз",
    heroTitle: "Онлайн білім орталығы",
    heroSubtitle: "Сабақтарды онлайн оқып, үй тапсырмаларын орындап, кері байланыс алыңыз.",
    cohortTitle: "Біздің MVP мүмкіндіктеріміз",
    cohortItems: {
      manualPayment: "Kaspi арқылы төлем жасау",
      homework: "Үй тапсырмаларын тексеру",
      enrollmentGate: "Қолжетімді бағалар",
      bilingual: "Сапалы білім алу",
    },
    publishedTitle: "Курстар тізімі",
    viewAll: "Толық курстар тізімі",
    noCourses: "Жарияланған курстар жоқ.",
    weeksLabel: "апта",
    details: "Толығырақ",
  },
  courses: {
    label: "Курстар тізімі",
    title: "Курстар тізімі",
    subtitle: "Курстарды сатып алыңыз.",
    none: "Курстар жоқ.",
  },
  buttons: {
    browseCourses: "Курстарды қарау",
    startLearning: "Оқуды бастау",
    getAccess: "Сатып алу",
    submit: "Жіберу",
    save: "Сақтау",
    create: "Құру",
    update: "Жаңарту",
    open: "Ашу",
    download: "Жүктеу",
    continueLearning: "Жалғастыру",
    enroll: "Тіркелу",
    buy: "Сатып алу",
    backToCourse: "Курсқа оралу",
    markCompleted: "Аяқталды деп белгілеу",
    completed: "Аяқталды",
    resubmit: "Қайта тапсыру",
    openCourse: "Курсты ашу",
    goToHomework: "Үй тапсырмасына өту",
    saveDraft: "Сақтау",
    markChecked: "Тексерілді деп белгілеу",
    uncheck: "Белгіні алу",
  },
  auth: {
    loginTitle: "Кіру",
    signupTitle: "Аккаунт құру",
    email: "Эл. пошта",
    password: "Құпиясөз",
    fullName: "Аты-жөні",
    preferredLanguage: "Таңдалған тіл",
    signingIn: "Кіру...",
    creating: "Құрылуда...",
    noAccount: "Аккаунтыңыз жоқ па?",
    haveAccount: "Аккаунтыңыз бар ма?",
    signIn: "Кіру",
    signUp: "Тіркелу",
    loading: "Жүктелуде...",
  },
  course: {
    published: "Жарияланған",
    draft: "Жоба",
    durationWeeks: "апта",
    price: "Бағасы",
    syllabus: "Оқу жоспары",
    modules: "Модульдер",
    lessons: "Сабақтар",
    noLessons: "Бұл курста әзірше сабақ жоқ.",
    accessRequired: "Қолжетімділік қажет",
    pendingReview: "Қаралуда",
    approvedUpdating: "Расталды, қолжетімділік жаңартылуда...",
    alreadyPurchased: "Курс сатып алынған",
    startFromFirst: "Бірінші сабақтан бастау",
    resumeFromLast: "Соңғы сабақтан жалғастыру",
  },
  learn: {
    title: "Курс шолуы",
    progress: "Прогресс",
    lessonsCompleted: "сабақ аяқталды",
    noLessons: "Курсқа сабақ қосылмаған.",
    selectLesson: "Оқуды бастау үшін сол жақтан сабақты таңдаңыз.",
  },
  lesson: {
    title: "Сабақ",
    resources: "Ресурстар",
    attachments: "Қосымшалар",
    noResources: "Ресурстар жоқ.",
    yourSubmission: "Сіздің жұмысыңыз",
    statusPending: "Тексерілуде",
    statusChecked: "Тексерілді",
    grade: "Баға",
    feedback: "Пікір",
    submittedAt: "Жіберілген уақыты",
    checkedAt: "Тексерілген уақыты",
    checkedBy: "Тексерген",
    previous: "Алдыңғы",
    next: "Келесі",
    noHomework: "Бұл сабақта үй тапсырмасы жоқ.",
    notCompleted: "Аяқталмаған",
    loading: "Сабақ жүктелуде...",
    notFound: "Сабақ табылмады.",
    videoLink: "Видео-сілтеме",
    openVideo: "Видеоны ашу",
    quizTitle: "Тест",
    score: "Нәтиже",
    signInQuiz: "Тестке қол жеткізу үшін жүйеге кіріңіз.",
    noQuiz: "Бұл сабақта тест жоқ.",
    correct: "Дұрыс",
    checkedLabel: "Тексерілді",
    image: "Сурет",
    yourAnswer: "Жауабыңыз",
    selectMatch: "Сәйкестендіруді таңдаңыз",
    submitQuiz: "Жіберу",
    quizSubmitted: "Тест жіберілді.",
    submitting: "Жіберілуде...",
    saving: "Сақталуда...",
    completedUndo: "Аяқталды (болдырмау)",
    syllabusTitle: "Оқу жоспары",
    modulesLessons: "Модульдер мен сабақтар",
    openOnYouTube: "YouTube-та ашу",
    quizLoadFailed: "Тестті жүктеу сәтсіз аяқталды.",
    quizSubmitFailed: "Тестті жіберу сәтсіз аяқталды.",
  },
  assignment: {
    title: "Үй тапсырмасы",
    instructions: "Нұсқаулық",
    textAnswer: "Жауап мәтіні",
    textAnswerPlaceholder: "Шешіміңіз...",
    attachFile: "Файл тіркеу",
    openAttachment: "Ашу",
    downloadAttachment: "Жүктеу",
    submitHomework: "Үй тапсырмасын жіберу",
    submitting: "Жіберілуде...",
    pendingReview: "Тексерілуде",
    checked: "Тексерілді",
    allowResubmit: "Қайта тапсыру",
    uploading: "Жүктелуде...",
    submitError: "Жіберу сәтсіз аяқталды",
    invalidFileType: "Файл түрі қолжетімсіз.",
    fileTooLarge: "Файл тым үлкен.",
    alreadySubmitted: "Бұл тапсырма бұрын жіберілген.",
    missingCourseLesson: "Курс немесе сабақ туралы дерек жоқ. Бетті жаңартып көріңіз.",
    uploadDenied: "Жүктеу үшін рұқсат жоқ. Қайта көріңіз немесе қолдауға жазыңыз. +77075214911",
  },
  checkout: {
    manualPayment: "Төлем жасау",
    instructionsTitle: "Kaspi нұсқаулығы",
    instructionsBody:
      "Kaspi арқылы +77075214911 нөміріне немесе 4400 4302 8060 1375 банк нөміріне {Есіміңіз} комментарийімен төлеңіз. Түбіртек скринін жүктеңіз немесе комментарийді енгізіңіз.",
    amount: "Сома",
    proofLabel: "Түбіртек / квитанция",
    proofPlaceholder: "Kaspi квитанциясы, төлеуші аты және т.б.",
    attachScreenshot: "Скриншот тіркеу (міндетті емес)",
    underReview: "Қаралуда. Растауды күтіңіз.",
    approvedUpdating: "Расталды, қолжетімділік жаңартылуда...",
    submitting: "Жіберілуде...",
    submitForReview: "Қарауға жіберу",
    signInRequired: "Төлемді жіберу үшін жүйеге кіріңіз.",
    alreadyUnderReview: "Сіздің төлеміңіз қазір қаралуда.",
    alreadyOwned: "Бұл курс сізде бар.",
    paymentExists: "Бұл курс үшін төлем бар.",
  },
  admin: {
    courses: "Курстар",
    payments: "Төлемдер",
    submissions: "Жұмыстар",
    pending: "Күтілуде",
    checked: "Тексерілді",
    all: "Барлығы",
    noSubmissions: "Жұмыстар жоқ.",
    noPayments: "Төлемдер жоқ.",
  },
  dashboard: {
    subtitle: "Белсенді және күтілудегі тіркеулер.",
    empty: "Тіркеулер жоқ.",
  },
  myCourses: {
    title: "Тіркелген курстарыңыз",
  },
  teacher: {
    submissions: "Жұмыстар",
    pending: "Күтілуде",
    checked: "Тексерілді",
    all: "Барлығы",
  },
  pdf: {
    title: "PDF алдын ала қарау",
    openInNewTab: "Жаңа бетте ашу",
    download: "Жүктеу",
    openPdf: "PDF ашу",
    openFile: "Файл ашу",
    previewUnavailable: "Алдын ала қарау мүмкін емес. Сілтемені пайдаланыңыз.",
  },
  errors: {
    accessDenied: "Қолжетімділік жоқ",
    loadFailed: "Жүктеу сәтсіз аяқталды",
    notFound: "Табылмады",
    noAccess: "Бұл контентке рұқсат жоқ.",
    signInRequired: "Жалғастыру үшін жүйеге кіріңіз.",
  },
};

const DICT = { en: EN, kz: KZ } as const;

type Primitive = string;
type DeepKey<T> = T extends Primitive
  ? never
  : {
      [K in keyof T & string]: T[K] extends Primitive ? K : `${K}.${DeepKey<T[K]>}`;
    }[keyof T & string];

export type I18nKey = DeepKey<Dictionary>;

const getByPath = (obj: Record<string, unknown>, key: string): string | undefined => {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
};

export const t = (locale: Language, key: I18nKey): string => {
  const value = getByPath(DICT[locale] as Record<string, unknown>, key);
  if (locale === "kz" && (value === undefined || value === "")) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing "kz" key: ${key}`);
    }
  }
  return value ?? getByPath(DICT.en as Record<string, unknown>, key) ?? key;
};

type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: I18nKey) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider = ({ children, initialLang }: { children: React.ReactNode; initialLang: Language }) => {
  const [lang, setLangState] = useState<Language>(initialLang);

  const setLang = (next: Language) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lang", next);
      document.cookie = `lang=${next};path=/;max-age=${60 * 60 * 24 * 365}`;
    }
  };

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key: I18nKey) => t(lang, key),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
};

export const pickLang = <T,>(kz: T | undefined, en: T | undefined, lang: Language): T | undefined =>
  lang === "kz" ? kz : en ?? kz;
