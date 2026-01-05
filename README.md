# ENT Cohort Platform

Minimal Next.js + Firebase MVP for the 8-week ENT Math/Physics course. Supports manual Kaspi payments, homework submissions, and bilingual KZ/EN UI.

## Stack
- Next.js App Router + TypeScript + Tailwind v4
- Firebase Auth, Firestore, Storage
- Lightweight UI kit (shadcn-inspired) with custom components

## Setup
1. Copy `.env.example` to `.env.local` and fill Firebase keys.
2. Install deps: `npm install`.
3. Run dev server: `npm run dev`.
4. Quality gates: `npm run lint && npm run build`.

## App Routes
- Public: `/`, `/courses`, `/courses/[courseId]`, `/login`, `/signup`
- Student: `/dashboard`, `/learn/[courseId]`, `/learn/[courseId]/lesson/[lessonId]`, `/assignment/[assignmentId]`, `/checkout/[courseId]`
- Admin: `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/payments`, `/admin/submissions`

## Firebase Rules
- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`

## Notes
- Enrollments use deterministic IDs `${uid}_${courseId}` to make rule checks fast.
- Manual payment flow: student submits proof -> admin confirms -> enrollment becomes active.
- Assignments link to lessons; submissions support text + file upload.
