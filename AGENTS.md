<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Preply Lessons — project rules

Read `docs/ARCHITECTURE.md` first: it is the API contract. Update it in the same change whenever a
route, a response shape or a table changes.

- **Stack**: Next.js 16 Pages Router, plain JS (no TypeScript), `@/` absolute imports only (no `../`).
- **Languages**: teacher and back-office UI in French, student UI (login, onboarding, `/student/*`) in
  English, lesson content in French. API errors follow the caller: `handleError(res, err, ctx, 'fr')` on
  teacher/admin routes, English on student routes.
- **Auth**: the role and flags live in `app_metadata` (`role`, `is_admin`, `approved`) — never trust
  `user_metadata`. Every API route starts with `requireUser` / `requireTeacher` / `requireAdmin`
  (`utils/auth/server.js`), then uses the service-role client `createAdminClient()`. The browser never
  reads tables (clients have no grants since migration 0006).
- **Students** only see their own lessons that are visible: use the helper in
  `utils/api/studentLessons.js` for every student query (published or regenerating with content, not
  `hidden`). Progress and mistakes only count results at/after `lessons.generated_at`.
- **Lesson data**: shapes in `utils/lesson/schema.js`; grading in `utils/lesson/grading.js` (shared by
  the player and the API). Text fields are plain text with optional `**bold**` and `\n`, rendered with
  `components/lesson/RichText.jsx` — never `dangerouslySetInnerHTML`.
- **AI**: prompts in `utils/ai/`. The teacher's private notes (`student_notes.notes`) are never sent to the
  AI (only `student_notes.ai_context`). Untrusted text (transcript, Canva, documents, student profile) is
  fenced as data in prompts. Long generations run in the background (`utils/api/background.js`) and the
  route answers 202.
- **Design**: tokens in `styles/tokens.css` (`--st-*`, AA-contrast variants for text and buttons),
  primitives in `components/ui/ui.module.css`, one CSS module per component. Onboarding keeps its own look
  (`--ob-*`).
- **Lesson document naming (Google Drive / imports)**:
  When naming or renaming lesson documents (PDF, Google Docs) for bulk import, strictly follow the format:
  `L{XX}_{Titre de la leçon}_{YYYY-MM-DD}` (e.g. `L01_Reactivation et Bilan_2026-10-10.pdf` or `L01_Conversation et Present_2026-10-08.pdf`).
  If no lesson number applies: `{Titre de la leçon}_{YYYY-MM-DD}`.
  This allows the parser (`utils/import/detect.js`) to automatically extract the lesson date in ISO format, the lesson number, and a clean lesson title without manual entry.
- **Checks**: `pnpm test` (Vitest, `tests/`), `pnpm build`. Local database: `pnpm db:start` (Supabase CLI +
  Docker/Colima), migrations in `supabase/migrations/` are applied automatically there.
