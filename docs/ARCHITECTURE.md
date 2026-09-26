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

Student (requireUser; teachers get 403)
- `POST /api/onboarding/complete` `{ fullName, level, goals, interests }` → `{ profile }`
- `POST /api/student/deleteProfile` → `{ success: true }`
- `GET  /api/student/lessons` → `{ driveFolderUrl, lessons: [{ id, title, lesson_date, exercise_count, best_score, best_total, attempts, drive_url }] }` (published only, newest first; best_score/best_total null if never practised)
- `GET  /api/student/lessons/[id]` → `{ lesson: { id, title, lesson_date, content, exercises, drive_url }, progress: { best_score, best_total, attempts } }` (404 unless own + published)
- `POST /api/student/lessons/[id]/practice` `{ answers: [{ exerciseId, value }] }` → `{ score, total, bestScore }` (server re-grades; first answer per exercise counts)

Teacher (requireTeacher)
- `GET    /api/teacher/students` → `{ students: [{ id, email, full_name, level, onboarded_at, created_at, lesson_count, last_lesson_date }] }`
- `GET    /api/teacher/students/[id]` → `{ student: { id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at }, notes, lessons: [{ id, title, lesson_date, status, error, exercise_count, created_at, updated_at, best_score, best_total, attempts }] }`
- `PATCH  /api/teacher/students/[id]` any of `{ fullName, level, goals, interests, driveFolderUrl, notes }` → same shape as GET (`driveFolderUrl` must be a Google Drive https URL or '' → else 400)
- `POST   /api/teacher/lessons` `{ studentId, lessonDate: 'YYYY-MM-DD', title?, transcript, canva }` → `201 { lesson: { id, status, error } }`. Runs the AI synchronously (can take 30–120 s). `status` is `'published'` or `'failed'`; the row is kept either way so it can be regenerated.
- `GET    /api/teacher/lessons/[id]` → `{ lesson: { id, student_id, student_name, title, lesson_date, status, error, content, exercises, drive_url, transcript, canva, ai_model, created_at, updated_at }, sessions: [{ score, total, completed_at }] }`
- `PATCH  /api/teacher/lessons/[id]` any of `{ title, lessonDate, driveUrl, removeExerciseIds: string[] }` → `{ lesson }` (same shape as GET's lesson)
- `DELETE /api/teacher/lessons/[id]` → `{ success: true }`
- `POST   /api/teacher/lessons/[id]/regenerate` `{ transcript?, canva? }` → `{ lesson: { id, status, error } }` (409 if already generating < 5 min ago)

Browser code calls these with `api()` from `utils/apiClient.js`.

## Pages

- `/login`, `/auth/callback`, `/` (router), `/onboarding` — English
- `/student`, `/student/lessons/[id]`, `/student/lessons/[id]/practice` — English
- `/teacher`, `/teacher/students/[id]`, `/teacher/lessons/new?student=<id>`, `/teacher/lessons/[id]` — French
- `/dev/preview` — dev-only preview of LessonView + PracticePlayer with `SAMPLE_LESSON` (404 in production)

`proxy.js` does optimistic redirects (auth, teacher vs student areas). Use
`components/AppShell.jsx` for page chrome (except the full-screen practice player).

## AI (utils/ai/)

OpenAI-compatible `chat/completions`. Env: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
Without `AI_API_KEY` outside production, a demo generator returns `SAMPLE_LESSON`.
