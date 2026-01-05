# SPEC — Online Education Center (ЕНТ Math/Physics) — MVP v1

## 0. Goal
Build a minimal, production-lean web platform for an 8-week cohort course:
**ЕНТ: Математика + Физика**, bilingual UI/content **KZ/EN**, with paywall + homework submissions.
Primary objective: start selling and delivering cohorts with minimal cost and fast iteration.

Non-goals (v1): full LMS features (certificates, gamification), automated payment gateways, advanced analytics, proctoring.

## 1. Users & Roles
### Roles
- **student**: enrolls in courses, consumes lessons, submits homework.
- **teacher** (optional in v1): checks homework and leaves feedback.
- **admin**: creates/edits courses and content; confirms payments; manages enrollments; reviews submissions.

Role source of truth: Firestore `users/{uid}.role`.

## 2. Product Scope (MVP)
### Must-have
1) Public course catalog + course detail page (published only)
2) Auth: email/password
3) Student dashboard: “My Courses”
4) Course player: modules + lessons (video/text/attachments)
5) Assignments & submissions (text + file upload)
6) Manual payment flow (Kaspi): student submits payment proof; admin confirms; enrollment becomes active
7) Admin panel: CRUD course/module/lesson + confirm payments + review submissions
8) Access control via Firestore/Storage security rules
9) Bilingual UI/content (KZ/EN) toggle

### Nice-to-have (v2)
- ENТ trainer for 4 question types
- Progress tracking per lesson
- Teacher workflow (separate role UI)
- Automated payment integration

## 3. Tech Stack
- **Next.js** (App Router) + **TypeScript**
- **TailwindCSS** + **shadcn/ui**
- **Firebase Auth** (Email/Password)
- **Firestore** (data)
- **Firebase Storage** (files: submissions, attachments)
- Hosting: **Vercel** (Next.js) + Firebase services

## 4. Routes / Pages
### Public
- `/` — landing (course highlights)
- `/courses` — catalog (filters)
- `/courses/[courseId]` — course page (program, price, CTA)
- `/login`, `/signup`

### Student (auth required)
- `/dashboard` — list of enrolled courses
- `/learn/[courseId]` — course player (modules/lessons)
- `/learn/[courseId]/lesson/[lessonId]` — lesson view + assignment CTA
- `/assignment/[assignmentId]` — submit homework form
- `/checkout/[courseId]` — manual payment instructions + payment proof form

### Admin (role=admin)
- `/admin` — overview
- `/admin/courses` — CRUD courses
- `/admin/courses/[courseId]` — manage modules & lessons
- `/admin/payments` — confirm payments -> create enrollments
- `/admin/submissions` — review, feedback, grade

## 5. Data Model (Firestore)
All timestamps are server timestamps.

### `users/{uid}`
- uid: string
- role: "student" | "teacher" | "admin"
- displayName: string
- email: string
- phone?: string
- createdAt: timestamp

### `courses/{courseId}`
- title_kz: string
- title_en: string
- description_kz: string
- description_en: string
- category: "exam" | "subject"   (for this MVP use "exam")
- tags: string[] (e.g., ["ENT","Math","Physics"])
- level: "beginner" | "intermediate" | "advanced"
- durationWeeks: number (8)
- price: number
- currency: "KZT"
- published: boolean
- createdAt: timestamp
- updatedAt: timestamp

### `modules/{moduleId}`
- courseId: string (ref to courses)
- order: number
- title_kz: string
- title_en: string
- createdAt: timestamp

### `lessons/{lessonId}`
- moduleId: string
- order: number
- type: "video" | "text" | "quiz" | "live"
- title_kz: string
- title_en: string
- content_kz?: string (HTML or Markdown)
- content_en?: string
- videoUrl?: string (YouTube unlisted / Drive / etc)
- attachments?: Array<{ name: string, url: string }>
- createdAt: timestamp

### `enrollments/{enrollmentId}`
- uid: string
- courseId: string
- status: "pending" | "active" | "expired" | "refunded"
- paidAmount?: number
- paidAt?: timestamp
- accessUntil?: timestamp
- createdAt: timestamp

Uniqueness: enforce 1 active enrollment per uid+courseId via query + UI (rules can’t enforce unique indexes; handle in admin confirm logic).

### `payments/{paymentId}` (manual Kaspi MVP)
- uid: string
- courseId: string
- provider: "manual_kaspi"
- amount: number
- status: "created" | "submitted" | "confirmed" | "rejected" | "refunded"
- proofText?: string (transaction id, comment)
- proofFileUrl?: string (Storage URL)
- createdAt: timestamp
- updatedAt: timestamp

### `assignments/{assignmentId}`
- lessonId: string
- title_kz: string
- title_en: string
- instructions_kz: string
- instructions_en: string
- createdAt: timestamp

### `submissions/{submissionId}`
- assignmentId: string
- uid: string
- textAnswer?: string
- fileUrl?: string
- submittedAt: timestamp
- feedback?: string
- grade?: number
- checkedBy?: string (uid)
- checkedAt?: timestamp

## 6. Storage Layout
- `submissions/{uid}/{submissionId}/{filename}`
- `attachments/{courseId}/{lessonId}/{filename}` (optional)
- `payments/{uid}/{paymentId}/{filename}` (proof files)

## 7. Access Rules (Authorization)
### Principles
- Public can only read published courses (+ their modules/lessons if you want public previews; by default lessons require enrollment).
- Students can read lessons/modules only if they have an **active enrollment** for that course.
- Students can create/read their own submissions; can’t read others.
- Admin can read/write everything.

## 8. Firestore Security Rules (outline)
Implement rules to satisfy:
- `users`: read/write self; admin can read/write all.
- `courses`: public read only where published=true; admin write.
- `modules`/`lessons`: read allowed only if course is published AND (public preview optional) OR user has active enrollment; admin write.
- `enrollments`: student can read own; create only by admin; update only by admin.
- `payments`: student can create/submit own; admin confirms/rejects.
- `assignments`: read allowed only if user has active enrollment; admin write.
- `submissions`: create by owner; read by owner or admin/teacher; update feedback/grade by admin/teacher.

NOTE: Rules require helper functions to check role and active enrollment by querying `enrollments` where uid==request.auth.uid and courseId==... and status=="active".
If rule query limitations appear, restructure: store `users/{uid}/activeEnrollments/{courseId}` as a simple doc for rules checks.

## 9. i18n (KZ/EN)
- UI translations via simple dictionary or next-intl.
- Content fields in Firestore include `_kz` and `_en` pairs.
- User selects language in UI; store preference in `users/{uid}.lang = "kz"|"en"` (optional).
- Default language: KZ.

## 10. UI/UX Minimal Requirements
- Clean minimal layout, mobile-first.
- Course player: left sidebar modules/lessons; main lesson view.
- Visible “Buy / Get Access” CTA when not enrolled.
- Dashboard shows enrolled courses + status.

## 11. Manual Payment Flow (Kaspi MVP)
1) Student clicks “Buy” -> `/checkout/[courseId]`
2) Page shows Kaspi payment instructions (static text)
3) Student submits form:
   - amount (auto-filled)
   - proofText (transaction id/comment)
   - optional proofFile upload
4) Create `payments` doc with status="submitted"
5) Admin reviews payments list, confirms:
   - set payment status="confirmed"
   - create enrollment status="active" with paidAt/paidAmount
6) Student now can access lessons

## 12. Deliverables for Codex (Implementation Tasks)
### Phase A — Setup
- Init Next.js + TS + Tailwind + shadcn
- Firebase init + env vars
- Base layout, routing, auth forms

### Phase B — Data & Services
- Firestore typed models + CRUD services for courses/modules/lessons
- Enrollment checks (client + server utilities)

### Phase C — Public Pages
- Catalog + course page (published only)

### Phase D — Student App
- Dashboard (enrollments)
- Course player + lesson page
- Assignment submission (text + file upload)

### Phase E — Admin
- Admin guard (role check)
- CRUD course/module/lesson
- Payments confirm -> enrollment active
- Submissions review + feedback/grade

### Phase F — Security
- Firestore rules
- Storage rules

### Phase G — i18n
- UI toggle + content fields support

## 13. Acceptance Criteria
- A user can sign up, browse courses, buy via manual flow, get confirmed by admin, and access lessons.
- Without active enrollment, lesson content is not accessible.
- Student can submit homework; admin can review and leave feedback.
- KZ/EN toggle works for UI and course titles/descriptions/lesson titles/content.
