# Architecture — Preply Lessons

Next.js 16 (Pages Router, plain JS, `@/` absolute imports) + Supabase (auth + Postgres).
One teacher (Wael), many students. After each class the teacher pastes the Preply
**transcript** and the **Canva notes** (both plain text) for a student; an
OpenAI-compatible LLM turns them into a **lesson recap** + **exercises**, published
immediately to the student, who reads the recap and practises Duolingo-style.

Teacher UI is in **French**. Student UI (login, onboarding, student pages) is in **English**.
Lesson content itself is French (with English translations).

## Data (supabase/migrations/0001_lesson_pipeline.sql)

- Role: `auth.users.app_metadata.role` = `'student' | 'teacher'` (server-controlled).
  Use `getRole(user)` from `utils/auth/server.js`. **Never** read `user_metadata.role`.
- `profiles(id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at, updated_at)`
- `student_notes(student_id, notes)` — teacher-only private notes.
- `lessons(id, student_id, title, lesson_date, transcript, canva, status 'generating'|'published'|'failed', error, content jsonb, exercises jsonb, drive_url, ai_model, created_at, updated_at)`
- `practice_sessions(id, lesson_id, student_id, score, total, answers jsonb, completed_at)`
- `lessons.generated_at` + `review_attempts(id, student_id, lesson_id, exercise_id, correct, value, created_at)` — supabase/migrations/0003_student_review.sql

All DB writes and reads go through API routes using the service-role client
(`createAdminClient()` from `utils/supabase/admin.js`) **after** `requireUser` /
`requireTeacher` (`utils/auth/server.js`). Every student query must be scoped by
`student_id = user.id` explicitly. RLS is read-only defence in depth.

## Lesson contract

`utils/lesson/schema.js` documents the exact shapes of `lessons.content` and
`lessons.exercises` and exports `normalizeLessonContent`, `normalizeExercises`,
`safeHttpsUrl`, `safeDriveUrl`, `LEVELS`, `BLANK`. `utils/lesson/grading.js` exports
`gradeAnswer(exercise, value)` and `scoreSession(exercises, answers)`.
`utils/lesson/sample.js` has `SAMPLE_LESSON` (raw AI-shaped example incl. `exercises`).

Text fields are plain text. They may contain `**word**` to highlight a key word and
`\n` / `\n\n` line/paragraph breaks. Render them with `components/lesson/RichText.jsx`
— never `dangerouslySetInnerHTML`.

## API (all JSON; errors are `{ error: string }`, status 4xx/5xx)

Any logged-in user
- `GET  /api/me` → `{ user: { id, email }, role, profile }` (`profile` may be null)

Student (requireUser; teachers get 403). Students can never generate lessons.
- `POST  /api/onboarding/complete` `{ fullName, level, goals, interests }` → `{ profile }`
- `PATCH /api/student/profile` any of `{ fullName, level, goals, interests }` → `{ profile }` (same validation as onboarding; English errors)
- `POST  /api/student/deleteProfile` → `{ success: true }`
- `GET   /api/student/lessons` → `{ driveFolderUrl, mistakeCount, lessons: [{ id, title, lesson_date, exercise_count, vocab_count, best_score, best_total, attempts, last_practiced_at, drive_url }] }` (visible lessons, newest first; best_score/best_total/last_practiced_at null if never practised)
- `GET   /api/student/lessons/[id]` → `{ lesson: { id, title, lesson_date, content, exercises, drive_url }, progress: { best_score, best_total, attempts } }` (404 unless own + visible: `published`, or `generating` with previous content during a regeneration)
- `POST  /api/student/lessons/[id]/practice` `{ answers: [{ exerciseId, value }] }` → `{ score, total, bestScore, bestTotal }` (server re-grades; first answer per exercise counts)
- `GET   /api/student/review` → `{ exercises: [{ ...exercise, id: '<lessonId>:<exerciseId>', lessonId, lessonTitle, lesson_date }] }` — exercises whose LATEST result (from practice_sessions.answers or review_attempts, only results at/after lessons.generated_at) is wrong; newest lessons first, max 20.
- `POST  /api/student/review` `{ answers: [{ exerciseId: '<lessonId>:<exerciseId>', value }] }` → `{ score, total, remaining }` — server re-grades each answer against the stored exercise, inserts one review_attempts row per answer, `remaining` = mistakes left afterwards.
- `GET   /api/student/vocabulary` → `{ items: [{ fr, en, example, kind: 'word'|'expression', lessonId, lessonTitle, lesson_date }] }` — vocabulary + expressions of all visible lessons, newest first, deduplicated by `fr` (case/accents-insensitive, newest kept).

"Mistake" = an exercise of a visible lesson whose most recent graded result (at/after `generated_at`) is incorrect. `mistakeCount` on `/api/student/lessons` uses the same rule (shared helper).

Teacher (requireTeacher)
- `GET    /api/teacher/students` → `{ students: [{ id, email, full_name, level, onboarded_at, created_at, lesson_count, last_lesson_date }] }`
- `GET    /api/teacher/students/[id]` → `{ student: { id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at }, notes, lessons: [{ id, title, lesson_date, status, error, exercise_count, created_at, updated_at, best_score, best_total, attempts }] }`
- `PATCH  /api/teacher/students/[id]` any of `{ fullName, level, goals, interests, driveFolderUrl, notes }` → same shape as GET (`driveFolderUrl` must be a Google Drive https URL or '' → else 400)
- `POST   /api/teacher/lessons` `{ studentId, lessonDate: 'YYYY-MM-DD', title?, transcript, canva }` → `201 { lesson: { id, status, error } }`. Runs the AI synchronously (can take 30–120 s). `status` is `'published'` or `'failed'`; the row is kept either way so it can be regenerated. A failed *regeneration* returns `'failed'` but keeps the previous version published for the student (the error is stored in `lessons.error`).
- `GET    /api/teacher/lessons/[id]` → `{ lesson: { id, student_id, student_name, title, lesson_date, status, error, content, exercises, drive_url, transcript, canva, ai_model, created_at, updated_at }, sessions: [{ score, total, completed_at }] }`
- `PATCH  /api/teacher/lessons/[id]` any of `{ title, lessonDate, driveUrl, removeExerciseIds: string[] }` → `{ lesson }` (same shape as GET's lesson)
- `DELETE /api/teacher/lessons/[id]` → `{ success: true }`
- `POST   /api/teacher/lessons/[id]/regenerate` `{ transcript?, canva? }` → `{ lesson: { id, status, error } }` (409 if already generating < 5 min ago)

Browser code calls these with `api()` from `utils/apiClient.js`.

## Pages

- `/login`, `/auth/callback`, `/` (router), `/onboarding` — English
- Student area (English, `components/student/StudentShell.jsx` chrome with bottom tabs on mobile): `/student` (home), `/student/lessons`, `/student/lessons/[id]`, `/student/lessons/[id]/practice` (full-screen, no shell), `/student/review` (mistakes practice, full-screen player), `/student/vocabulary` (word bank + flashcards), `/student/profile`
- `/teacher`, `/teacher/students/[id]`, `/teacher/lessons/new?student=<id>`, `/teacher/lessons/[id]` — French
- `/dev/preview` — dev-only preview of LessonView + PracticePlayer with `SAMPLE_LESSON` (404 in production)

`proxy.js` does optimistic redirects (auth, teacher vs student areas, back office).

Design system (whole app except onboarding): tokens in `styles/tokens.css` (`--st-*`),
primitives in `components/ui/ui.module.css`, Nunito via `components/ui/font.js`.
Page chrome: `StudentShell` / `TeacherShell` (both built on `components/ui/Shell.jsx`),
`AdminShell` for the back office; the practice player is full-screen without a shell.

## AI (utils/ai/)

OpenAI-compatible `chat/completions`. Env: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
Without `AI_API_KEY` outside production, a demo generator returns `SAMPLE_LESSON`.

## Back office (admin)

Served by the same app under `/admin`. `proxy.js` keeps back-office hosts
(`BACKOFFICE_HOSTS`, default `backoffice.lurl.com,backoffice.localhost`) inside
`/admin`, and every `/admin` page requires `app_metadata.is_admin === true`
(non-admins → `/admin/forbidden`). An admin keeps their normal role (usually teacher).
Migration: `supabase/migrations/0004_backoffice.sql` (`lessons.ai_usage`, `admin_audit_log`).

UI in **French**, desktop-first but usable on mobile, chrome = `components/admin/AdminShell.jsx`.

All routes: `requireAdmin` (utils/auth/server.js) → service-role client. French errors
`{ error }`. Every successful write calls `logAdminAction` (utils/api/audit.js).
Pagination params `page` (1-based) and `perPage` (default 50, max 200).

- `GET    /api/admin/stats` → `{ totals: { users, students, teachers, admins, onboarded, lessons, lessons_published, lessons_failed, practice_sessions, review_attempts }, last30: { days: ['YYYY-MM-DD' ×30, oldest first], signups: number[], lessons: number[], sessions: number[] }, successRate: number|null /* 0–100, avg of score/total */, ai: { calls, prompt_tokens, completion_tokens, estimated_cost_usd, price_input_per_m, price_output_per_m }, recent: { lessons: [{ id, title, student_id, student_name, status, created_at }] /* 5 */, signups: [{ id, email, full_name, created_at }] /* 5 */ } }`
- `GET    /api/admin/users?q=&role=all|student|teacher|admin&page=&perPage=` → `{ users: [{ id, email, full_name, role, is_admin, level, onboarded_at, created_at, last_sign_in_at, banned, lesson_count, session_count }], total, page, perPage }` (q matches email/name, case-insensitive; newest first)
- `POST   /api/admin/users` `{ email, fullName?, role: 'student'|'teacher', isAdmin?: boolean }` → `201 { user }` — sends a Supabase invitation email (the person sets their own password); role/is_admin set in app_metadata.
- `GET    /api/admin/users/[id]` → `{ user: { id, email, created_at, last_sign_in_at, role, is_admin, banned, providers: string[] }, profile, notes, lessons: [{ id, title, lesson_date, status, exercise_count, best_score, best_total, attempts }], sessions: [{ id, lesson_id, lesson_title, score, total, completed_at }] /* last 50 */, reviews: [{ id, lesson_id, exercise_id, correct, created_at }] /* last 50 */ }`
- `PATCH  /api/admin/users/[id]` any of `{ role, isAdmin, fullName, level, goals, interests, driveFolderUrl, notes, resetOnboarding: true, banned: boolean }` → same shape as GET. An admin cannot change their own role, remove their own admin flag, or ban themselves (400).
- `DELETE /api/admin/users/[id]` `{ confirmEmail }` (must equal the user's email) → `{ success: true }` (cannot delete yourself).
- `GET    /api/admin/lessons?q=&status=&studentId=&page=&perPage=` → `{ lessons: [{ id, title, lesson_date, status, student_id, student_name, exercise_count, ai_model, created_at, updated_at }], total, page, perPage }`
- `GET    /api/admin/lessons/[id]` → `{ lesson: { id, student_id, student_name, title, lesson_date, status, error, content, exercises, drive_url, transcript, canva, ai_model, ai_usage, generated_at, created_at, updated_at }, sessions: [{ id, score, total, completed_at }] }`
- `PATCH  /api/admin/lessons/[id]` any of `{ title, lessonDate, status: 'published'|'failed', studentId, driveUrl, content, exercises }` → `{ lesson }` (same shape as GET). `content` is re-normalized with `normalizeLessonContent`; `exercises` is the full edited array, validated with `normalizeExercisesForEdit` (keeps ids, no shuffling; items without id get the next free `ex_N`). `studentId` must be an existing student.
- `DELETE /api/admin/lessons/[id]` → `{ success: true }`
- `GET    /api/admin/tables` → `{ tables: [{ name, label, count }] }` — read-only explorer over: `auth_users` (virtual, from the Auth admin API), `profiles`, `student_notes`, `lessons`, `practice_sessions`, `review_attempts`, `admin_audit_log`.
- `GET    /api/admin/tables/[table]?q=&sort=<column>&dir=asc|desc&page=&perPage=` → `{ table, label, columns: [{ name, type: 'text'|'number'|'boolean'|'date'|'json'|'uuid' }], rows: object[], total, page, perPage }` — `q` searches the table's text columns; long text/json values are truncated to 500 chars (`lessons.transcript`/`canva` always truncated).
- `GET    /api/admin/audit?action=&entity=&page=&perPage=` → `{ entries: [{ id, admin_email, action, entity, entity_id, details, created_at }], total, page, perPage }`

AI cost estimate uses `AI_PRICE_INPUT_PER_M` / `AI_PRICE_OUTPUT_PER_M` (USD per 1M tokens, defaults 0.05 / 0.40 = qwen-flash) over `lessons.ai_usage`.
