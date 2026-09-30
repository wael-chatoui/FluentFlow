# Architecture — Preply Lessons

Technical reference of the app (repo FluentFlow), written from the code. It is the API contract:
any change to a route, a response shape, a table or a rule described here updates this file in the
same commit. Decisions, project state and history: `docs/CONTEXT.md`. Code rules: `AGENTS.md`.
Setup and operations (Supabase, Vercel, env): `README.md`.

- Production: <https://fluent-flow-mu.vercel.app> (Vercel, branch `main`).
- Back office: <https://fluent-flow-mu.vercel.app/admin> (same app and domain).

One teacher (Wael, also admin), a few invited students. After a class the teacher pastes the
Preply **transcript** and his **Canva notes** (or imports an existing PDF / Google Doc); an
OpenAI-compatible LLM writes, in the background, a **lesson recap** and **exercises** (multiple
choice, fill in the blank, match FR ↔ EN). The lesson is published to the student (or kept as a
draft), who reads the recap, prints it, practises Duolingo-style, reviews mistakes and words. The AI
also prepares **tutor plans** for the next class.

Languages: teacher area and back office in **French**; student side (login, auth pages, onboarding,
`/student/*`) in **English**; lesson content in **French** with English translations; tutor plans in
French.

Contents: [1. Stack and conventions](#1-stack-and-conventions) ·
[2. Authentication and access](#2-authentication-and-access) · [3. Data model](#3-data-model) ·
[4. Lesson contract](#4-lesson-contract) · [5. AI](#5-ai) · [6. API reference](#6-api-reference) ·
[7. Pages](#7-pages) · [8. Practice player](#8-practice-player) ·
[9. Design system](#9-design-system) · [10. Client state](#10-client-state-caches-cookies-storage) ·
[11. Local development, database, tests](#11-local-development-database-tests)

---

## 1. Stack and conventions

- **Next.js 16, Pages Router, plain JavaScript** (no TypeScript), React 18.2, Node ≥ 22, pnpm.
  Imports are absolute with `@/` (jsconfig and the Vitest alias), never `../`. Next 16 differs from
  older versions: `proxy.js` replaces `middleware.js`; the guides are in `node_modules/next/dist/docs/`.
- **Supabase**: Auth (Google OAuth and email links, no passwords anywhere) and Postgres.
  - Session: `@supabase/ssr` cookie clients (`utils/supabase/server.js` in API routes, `proxy.js`,
    `utils/supabase/client.js` in the browser, which returns `null` during server rendering).
  - Data: every read and write goes through an API route, after the auth check, with the
    service-role client `createAdminClient()` (`utils/supabase/admin.js`). The browser uses Supabase
    for auth only: clients have no grant on any table (migration 0006).
- **AI**: any OpenAI-compatible `chat/completions` API; default OpenRouter + `qwen/qwen3.7-flash`
  (`utils/ai/`).
- **PDF text extraction**: `unpdf`, server only (`utils/import/pdf.js`).
- **Files**: the app stores none. The recap is a web page the student prints ("Save as PDF", print
  stylesheet); Google Drive links (a student's folder, a lesson's PDF) are plain URLs.
- **Hosting**: Vercel with Fluid compute (a generation keeps running after the 202 answer, up to the
  route's `maxDuration` of 300 s).
- **Tests**: Vitest in a node environment (`tests/`).

| Path | Contents |
|---|---|
| `pages/`, `pages/api/` | pages and API routes |
| `proxy.js` | optimistic redirects (auth, areas, pending, onboarding, back-office host) |
| `components/<area>/` | `auth`, `onboarding`, `student`, `teacher` (+ `dashboard`, `lessons`, `students`, `import`), `admin`, `practice`, `lesson`, `ui`, `dev` |
| `utils/ai/` | AI client, prompts, lesson pipeline, tutor plans, ledger, generation options |
| `utils/api/` | route helpers: `errors`, `validate`, `sameOrigin`, `students`, `invites`, `studentLessons`, `progress`, `mistakes`, `background`, `audit`; `utils/api/admin/` for the back office |
| `utils/auth/` | server guards (`server.js`), pure routing (`routing.js`), sign-in link confirmation, in-app navigation marker |
| `utils/lesson/` | data contract (`schema.js`), grading, sample lesson |
| `utils/import/` | import limits, Google link parser and downloader, PDF / text extraction, date and title detection |
| `utils/profile/levels.js` | student-facing level wording (`LEVEL_INFO`, `levelShort`, `LEVELS`) |
| `utils/supabase/` | Supabase clients, `PROFILE_FIELDS`, browser sign-out |
| `utils/apiClient.js`, `utils/sound.js` | browser `api()` wrapper, sound effects |
| `styles/` | `tokens.css`, `globals.css`, `print.css` |
| `supabase/` | `config.toml` (local stack), `migrations/` |
| `scripts/bootstrap-owner.mjs` | makes an account teacher + admin |
| `tests/` | Vitest suites |

### API route skeleton

```js
export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return   // 405 + Allow header
  if (!allowSameOrigin(req, res)) return          // teacher routes (403 cross_site)
  const auth = await requireTeacher(req, res)     // or requireUser / requireAdmin
  if (!auth) return
  try {
    const admin = createAdminClient()             // service role, only after the check
    // … validate (utils/api/validate.js), query, respond
  } catch (err) {
    return handleError(res, err, 'teacher/…', 'fr') // 'en' (default) on student routes
  }
}
```

- Errors are JSON `{ error: string, code?: string }` (`utils/api/errors.js`): `fail(message)` → 400,
  `HttpError(status, message, code)` → that status, anything else is logged and answered with a
  generic 500 (`Something went wrong. Please try again.` / `Une erreur est survenue. Réessaie dans un
  instant.`). Messages are shown as-is by the pages: French on teacher and admin routes, English on
  student routes.
- Ids in paths are checked with `isUuid` (404 otherwise). A student's id always comes from the
  session, never from the request.
- Routes that run the AI export `config = { maxDuration: 300, … }` (body size limits in `api`).
- Browser code calls routes with `api()` from `utils/apiClient.js` (§2).
- Lesson text is rendered with `components/lesson/RichText.jsx`; nothing uses
  `dangerouslySetInnerHTML`.

### Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | session clients |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | `createAdminClient()`, bootstrap script |
| `NEXT_PUBLIC_SITE_URL` | server + browser | required in production (`https://fluent-flow-mu.vercel.app`, never localhost). Origin of links made from a back-office host, « Espace prof » / « Retour à l'application » links of the back office, bootstrap script link. Inlined at build time. |
| `AI_BASE_URL` | server | default `https://openrouter.ai/api/v1` |
| `AI_MODEL` | server | default `qwen/qwen3.7-flash` |
| `AI_API_KEY` | server only | required in production; empty outside production → demo mode |
| `AI_TIMEOUT_MS` | server | budget of one generation, retries included; default 240 000, capped at 270 000 |
| `AI_MAX_TOKENS` | server | `max_tokens` of each call, default 8192 |
| `AI_DEMO` | server | `1` = demo mode even with a key; ignored in production |
| `AI_PRICE_INPUT_PER_M`, `AI_PRICE_OUTPUT_PER_M` | server | USD per million tokens, to estimate calls without a provider-reported cost; defaults 0.05 / 0.40 |
| `BACKOFFICE_HOSTS` | server (proxy, invites) | optional, comma-separated hosts on which everything stays under `/admin`; default `backoffice.localhost`. Production has no dedicated host. |

`NODE_ENV` is also read (demo mode, `/dev/preview`, cookie `secure` flag); Next.js and Vercel set it.

---

## 2. Authentication and access

### Identity and flags

- Accounts are Supabase Auth users. Sign-in: « Continue with Google » (OAuth, PKCE) or a one-time
  email link. There are no passwords; a recovery link simply signs the user in.
- Authorization data lives in `auth.users.app_metadata`, which only the service role can write
  (`utils/auth/server.js`):

  | Flag | Values | Helper |
  |---|---|---|
  | `role` | `'teacher'`, anything else = `'student'` | `getRole(user)` |
  | `is_admin` | `true` = back-office access (independent of the role; the owner is teacher + admin) | `isAdmin(user)` |
  | `approved` | `false` = self sign-up waiting for the teacher; missing = approved; teachers are always approved | `isApproved(user)` |
  | `banned_until` (Auth column) | future date = suspended from the back office | `isBanned(user)` |

- `user_metadata` is editable by the user: never used for authorization. `user_metadata.full_name`
  is only a display copy of `profiles.full_name`, kept in sync by the API.

### Account lifecycle

1. **Owner**: `node --env-file=<env file> scripts/bootstrap-owner.mjs <email> [--no-admin]` sets
   `role: 'teacher'`, `approved: true`, `is_admin` (unless `--no-admin`) and ensures a profile row.
   If the account does not exist it is created and a one-time link (`NEXT_PUBLIC_SITE_URL`, default
   `http://localhost:3000`) is printed. Replaces the placeholder blocks of migrations 0002 and 0004.
2. **Invitation** (teacher `POST /api/teacher/students/invite`, back office `POST /api/admin/users`;
   both call `inviteUser()` in `utils/api/invites.js`):
   - any existing account with that address, confirmed or not, is refused with 409 `email_exists` and
     left untouched (Supabase Auth is not even called);
   - default: `auth.admin.generateLink({ type: 'invite' })` → a copyable one-time link
     `<origin>/auth/confirm?token_hash=…&type=invite` (the teacher sends it through the Preply chat);
     with `sendEmail: true`: `inviteUserByEmail` (Supabase sends the email, `link: null`);
   - then `app_metadata = { role, approved: true, is_admin }` and a profile row (email, full name). A
     returned user that looks pre-existing (already approved / teacher / admin, or created more than
     2 minutes before the call) is refused with 409 and never modified or deleted.
3. **Self sign-up**: « Continue with Google » with an address nobody invited creates an account (the
   Supabase setting "Allow new users to sign up" stays on) whose trigger sets `approved: false`. It
   only sees `/pending` until the teacher approves it (`…/approve`) or refuses it (`…/reject`, which
   deletes it). The email link of `/login` never creates an account (`shouldCreateUser: false`).
4. **New sign-in link** (lost access, expired invitation): `createSignInLink()` →
   `generateLink({ type: 'magiclink' })` → `<origin>/auth/confirm?token_hash=…&type=magiclink`.
   Nothing is emailed. Links are never written to the audit log.
5. **Suspension** (back office `banned: true` → `ban_duration: '876000h'`, `false` → `'none'`) and
   **deletion** (back office, the teacher refusing a pending account, or the student from their
   profile): deleting the auth user cascades to all their data (§3).

`appOrigin(req)` (origin of the links above): the request's own origin (`x-forwarded-host` /
`x-forwarded-proto`), except on a back-office host, where `NEXT_PUBLIC_SITE_URL` is required (500 with
a French message otherwise; `http://localhost:<port>` for `*.localhost`) so students never land inside
`/admin`. A localhost `NEXT_PUBLIC_SITE_URL` is ignored in production.

### Server guards (`utils/auth/server.js`)

`requireUser(req, res, { allowPending = false, lang = 'en' })` resolves the user from the auth cookies
(or an `Authorization: Bearer <access token>` header) and answers, in this order:

| Case | Status | Body |
|---|---|---|
| a write (any method but GET, HEAD, OPTIONS) sent by a page of another site or a sibling subdomain | 403 | `{ error, code: 'cross_site' }` |
| `getUser()` throws, or Supabase Auth is unreachable / answers ≥ 500 | 503 | `{ error }` (never a 401: the session may be fine) |
| no valid session | 401 | `{ error }` |
| account suspended | 403 | `{ error, code: 'banned' }` |
| account waiting for approval (unless `allowPending`) | 403 | `{ error, code: 'pending' }` |

It returns `{ user, role }`. Messages are English by default and French with `lang: 'fr'`; the codes
are the same. On top of it:

- `requireTeacher(req, res)` (French): 403 `{ error: 'Accès réservé au professeur.' }` unless role
  teacher.
- `requireAdmin(req, res)` (French): 403 `{ error: 'Accès réservé aux administrateurs.' }` unless
  `is_admin`.
- `allowMethods(req, res, methods)`: 405 `{ error: 'Method Not Allowed' }` with an `Allow` header.
- Cross-site check (`isCrossSiteWrite`, `utils/api/sameOrigin.js`): `Sec-Fetch-Site` must be
  `same-origin` or `none`; without it, `Origin` must match `Host` / `X-Forwarded-Host`; a request with
  neither header (not from a browser page) passes. It stops body-less POSTs and urlencoded forms,
  which carry the SameSite=Lax session cookies without a CORS preflight. Teacher routes (except the
  two import routes) also call `allowSameOrigin(req, res)` (`utils/api/validate.js`) before
  `requireTeacher`: the same check, answered before the auth lookup.
- Back-office writes also call `assertJsonBody(req)` (`utils/api/admin/guard.js`): only
  `application/json` bodies (a DELETE without body is accepted), else 415
  `{ code: 'unsupported_media_type' }`.
- Teacher routes only manage **student accounts**: `isStudentUser(user)` = role student **and not
  admin** (`utils/api/students.js`). An admin account, whatever its role, is invisible to the teacher
  area (404, left out of lists), so a teacher can never read it, edit it or get a sign-in link for it.
- Student routes refuse teachers with 403 (English) and scope every query to `auth.user.id`.

### Browser side

- `components/AuthProvider.jsx` → `useAuth()`: `{ user, session, role, isAdmin, loading,
  signOut({ scope = 'global' }), refreshUser() }`. Role and admin flag come from `app_metadata`, for
  display and routing only (the API re-checks everything). `signOut` is global (every device) on
  purpose, never throws and never waits more than 8 s (`endSession()` in `utils/supabase/signOut.js`);
  it deletes any leftover `sb-<ref>-auth-token*` cookies, clears the link-confirmation cookie and
  resolves `{ revoked, timedOut }`. When the server could not confirm a global sign-out, `/login`
  says once that other devices may still be signed in.
- `api(path, { method, body, raw, headers, signal, timeout })` (`utils/apiClient.js`): JSON in and out
  (`raw` sends a body as-is, e.g. a PDF). Non-2xx → `ApiError(message, status, code)` with the
  server's `error` and `code`. Default timeout 60 s → code `timeout`; network failure → status 0.
  401 → the session cookies are cleared locally (no request) and the browser goes to
  `/login?next=<current page>`; the thrown error has code `session_expired` (seen only if the user
  stays on the page after an unsaved-changes prompt; the redirect guard resets after 1 s). 403
  `pending` → `/pending`. Fallback messages are French when `<html lang="fr">`.

### Proxy (`proxy.js`)

Matcher: every path except `_next/`, `api/`, `auth/`, `favicon.ico` and files with an extension.
`/auth/*` is excluded on purpose: with a matching proxy, Next.js puts the original URL, one-time
tokens included, back in the address bar after hydration. Rules, in order:

1. On a back-office host (`BACKOFFICE_HOSTS`): every path that is neither shared (`/login`, `/logout`,
   `/auth/callback`, `/auth/confirm`, `/pending`, `/admin/forbidden`) nor under `/admin` → `/admin`.
2. Only the protected areas are checked: `/student`, `/teacher`, `/onboarding`, `/admin` (except
   `/admin/forbidden`, which is public) and `/pending`.
3. The user is read with `getUser()` (fresh role, approval and ban). If Supabase Auth fails or
   throws, the page loads anyway: its API calls answer 503 and it shows a retry (no `/login` loop).
4. No user → `/login?next=<path and query>` (next dropped beyond 512 characters; `/pending` → `/login`).
5. Suspended → `/login`, which explains it and signs the browser out.
6. Cookie `pl-link-confirm` equal to the user id (signed in by a link, not confirmed yet) →
   `/auth/confirm?next=…`.
7. `/pending`: pending accounts stay, others go to `/`. A pending account on any other protected page
   → `/pending` (checked before the admin rule).
8. `/admin/*` without `is_admin` → `/admin/forbidden`.
9. `/teacher/*` for a non-teacher → `/student`; `/student/*` or `/onboarding` for a teacher → `/teacher`.
10. `/student/*` requires a finished onboarding (`profiles.onboarded_at`), else `/onboarding`. Checked
    once in the database, then remembered in the httpOnly cookie `pl-onboarded` (value = user id,
    30 days). A database error lets the student through: this is not a security boundary.

Refreshed Supabase cookies are copied onto redirect responses.

### Auth pages

| Page | Behaviour |
|---|---|
| `/login` | « Continue with Google » (`signInWithOAuth`, `prompt: 'select_account'`, so the wrong Google account cannot silently create a pending account) and « Email me a sign-in link » (`signInWithOtp`, `shouldCreateUser: false`; the same confirmation whether or not the account exists; own messages only for rate limits, network errors and 5xx; « Resend » after 60 s). Short invite-only note. A safe `?next` is kept through `redirectTo = /auth/callback?next=…`. A signed-in visitor is sent on (`/api/me` → `pathAfterSignIn`); a suspended one is signed out with an explanation. |
| `/auth/callback`, `/auth/confirm` | The same page (`components/auth/SignInLanding.jsx`, logic in `components/auth/landing.js`); every link format works on both: `?code` (PKCE: Google and the `/login` email links, only in the browser that asked), `?token_hash&type` with type `invite`, `magiclink`, `email`, `signup` or `recovery` (`verifyOtp`, any device), `#access_token&refresh_token` (default Supabase email templates, `setSession`), `?error…` (fixed English messages: cancelled, expired, other browser, no account, suspended, incomplete link, server unreachable with « Try again », generic; URL text is never shown). Tokens leave the address bar at once (a PKCE code once exchanged); a one-time token is never sent twice. If another account is already signed in on the browser: « Use this link » / « Keep my current account ». After a `token_hash` or `access_token` sign-in the user confirms « Is this your account? … <email> » (login-CSRF guard, `utils/auth/linkConfirm.js`, cookie `pl-link-confirm`, enforced by the proxy); « No, that's not me » signs this browser out. |
| `/pending` | Waiting for approval: shows the email, « Check again » (also silently on arrival and when the tab comes back, at most every 30 s) and « Sign out » (→ `/logout`). |
| `/logout` | Global sign-out, then `/login` (`?next` passed on). Signs out at once only when reached by an in-app navigation (`utils/auth/appNavigation.js`, marked by `pages/_app.js`); a direct page load, which any site can trigger, asks « Sign out? » first (in French with `?from=teacher` or `?from=admin`, or a French `next`). Never acts inside a frame. After a timed-out sign-out it reloads `/login` fully. Works on every host. |
| `/` | Router. Hands sign-in parameters that Supabase sent to the Site URL (`token_hash`, `error…`, `#access_token`, and `?code` when signed out) to `/auth/confirm`. Otherwise: not signed in → `/login`; else `/api/me` → `pathAfterSignIn`. If `/api/me` fails: a guess from the session (`fallbackDestination`: students → `/student`, the proxy corrects pending or not-onboarded accounts); suspended → `/login`. |
| `/admin/forbidden` | Public page for signed-in non-admins: shows the account, « Changer de compte » (`/logout?next=/admin`), « Se déconnecter » (`/logout`), « Retour à l'application » when `NEXT_PUBLIC_SITE_URL` is set. |

Routing rules (`utils/auth/routing.js`, pure and tested):

- `pathAfterSignIn({ role, approved, onboarded, isAdmin, next })`: teacher → `next` if under `/teacher`
  or `/admin`, else `/teacher`; `approved === false` → `/pending`; an admin student with `next` under
  `/admin` → `next`; not onboarded → `/onboarding`; else `next` if under `/student`, else `/student`.
- `safeNext(value)`: only same-origin paths (starts with `/`, no `//`, `\`, scheme, control character
  or whitespace, ≤ 512 characters); returns the normalized path (`/teacher/../logout` is `/logout`).
- `inArea(path, area)` matches whole segments (`/teachers-x` is not `/teacher`).
- `pageLang(pathname)` → `'fr'` under `/teacher` and `/admin`, `'en'` elsewhere.

`<html lang>` is set by `pages/_document.js` on the first load and by `pages/_app.js` in a layout
effect on client-side navigations (before the new page's own effects, so its first `api()` errors use
the right language); `/logout` keeps the language it was opened from. English blocks shown on French
pages carry their own `lang` (the practice player and the `LessonView` root use `lang="en"`, French
lesson text uses `lang="fr"`).

---

## 3. Data model

Postgres schema `public`, created by `supabase/migrations/0001`–`0006` (all idempotent, all applied in
production). Every `created_at` defaults to `now()`; every `id` defaults to `gen_random_uuid()`, except
`profiles.id`, which is the auth user's id.

### Tables

**`profiles`** — one row per auth user, created by a trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | → `auth.users` on delete cascade |
| `email` | text | |
| `full_name` | text | ≤ 120 via the API |
| `level` | text | `A1`…`C2` or `unknown` (`LEVELS`) |
| `goals`, `interests` | text | ≤ 1000 each via the API |
| `drive_folder_url` | text | https Google Drive / Docs link set by the teacher |
| `onboarded_at` | timestamptz | null until onboarding is done |
| `created_at`, `updated_at` | timestamptz | `updated_at` by trigger |

**`student_notes`** — teacher-only, one row per student.

| Column | Type | Notes |
|---|---|---|
| `student_id` | uuid PK | → `auth.users` on delete cascade |
| `notes` | text | « Notes privées » (≤ 10 000), **never sent to the AI** |
| `ai_context` | text | « Contexte pour l'IA » (≤ 4000), sent to the AI (0006) |
| `updated_at` | timestamptz | by trigger |

**`lessons`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid | → `auth.users` on delete cascade |
| `title` | text | ≤ 120 via the API |
| `lesson_date` | date | not null, default `current_date` |
| `status` | text | not null, default `'generating'`, check `generating`, `published`, `failed` |
| `error` | text | reason of a failed generation; on a published lesson: a failed regeneration |
| `content` | jsonb | lesson recap (§4), null until the first successful generation |
| `exercises` | jsonb | not null, default `[]` (§4) |
| `drive_url` | text | the lesson's PDF on Google Drive |
| `transcript`, `canva` | text | sources of a transcript lesson |
| `ai_model` | text | model of the current version (`'demo'` in demo mode) |
| `ai_usage` | jsonb | 0004 — usage of the current version `{ prompt_tokens, completion_tokens, total_tokens, cost? }` |
| `generated_at` | timestamptz | 0003, default `now()` — version of `content` / `exercises` (§4) |
| `source_kind` | text | 0005, not null, default `'transcript'`, check `transcript`, `import` |
| `source_name`, `source_text` | text | 0005 — imported document's name and text |
| `generation_options` | jsonb | 0005 — `{ count, types, instructions }` |
| `hidden` | boolean | 0006, not null, default false — draft or withdrawn: invisible to the student, independent of `status` |
| `client_key` | uuid | 0006 — idempotency key of create / import |
| `created_at`, `updated_at` | timestamptz | `updated_at` by trigger |

Indexes: `lessons_student_date_idx (student_id, lesson_date desc, created_at desc)`; unique
`lessons_student_client_key_idx (student_id, client_key) where client_key is not null`.

**`practice_sessions`** — one row per saved practice run.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `lesson_id` | uuid | → `lessons` on delete cascade |
| `student_id` | uuid | → `auth.users` on delete cascade |
| `score` | int | ≥ 0 |
| `total` | int | > 0 (number of exercises of the version played) |
| `answers` | jsonb | `[{ exerciseId, value, correct }]`, first attempt per exercise, graded by the server |
| `completed_at` | timestamptz | default `now()` |
| `client_run_id` | uuid | 0006 — the player's `runId` (idempotent saves) |

Indexes: `(lesson_id, student_id, completed_at desc)`; 0006: `(student_id, completed_at desc)`,
unique `(student_id, client_run_id) where client_run_id is not null`.

**`review_attempts`** (0003) — one row per answer of a « Review mistakes » round: `id`, `student_id`
(→ `auth.users` cascade), `lesson_id` (→ `lessons` cascade), `exercise_id` text, `correct` boolean,
`value` jsonb, `created_at`. Indexes: `(student_id, created_at desc)`; 0006: `(lesson_id)`.

**`admin_audit_log`** (0004) — `id`, `admin_id` (→ `auth.users` on delete set null), `admin_email`,
`action` (`user.invite`, `user.update`, `user.approve`, `user.sign_in_link`, `user.delete`,
`lesson.update`, `lesson.delete`), `entity` (`user`, `lesson`), `entity_id` text, `details` jsonb (what
changed; never links or private text: notes and AI context are recorded as `{ changed, length }`;
teacher-area actions carry `via: 'teacher'`), `created_at`. Index `(created_at desc)`.

**`lesson_plans`** (0006) — tutor plans: `id`, `student_id` (→ `auth.users` cascade), `focus` text,
`content` jsonb not null (plan shape, §4), `ai_model`, `created_at`. Index `(student_id, created_at desc)`.

**`ai_generations`** (0006) — AI ledger, one row per generation attempt, success or failure: `id`,
`kind` (`'lesson'` or `'plan'`), `lesson_id` (→ `lessons` on delete set null), `student_id`
(→ `auth.users` on delete set null), `model`, `ok` boolean, `error` text (≤ 500), `prompt_tokens`,
`completion_tokens`, `duration_ms`, `cost_usd` numeric (cost reported by OpenRouter; null = unknown),
`created_at`. Index `(created_at desc)`.

### Functions and triggers

- `touch_updated_at()`: `before update` on `profiles`, `student_notes`, `lessons`.
- `handle_new_user_role()` (`before insert on auth.users`): sets `role: 'student'` unless the role is
  `student` or `teacher`; since 0006 also `approved: false` when the flag is absent (self sign-ups
  start pending; `inviteUser` and the bootstrap script set `approved: true` right after creation).
- `handle_new_user_profile()` (`after insert on auth.users`): inserts the profile (`email`, `full_name`
  from `user_metadata.full_name` or `name`).
- `is_teacher()` (0001) was used by the read policies dropped in 0006; nothing uses it now.

### Access lock-down and grants (0006)

- RLS is enabled on every table. 0006 drops every client read policy and runs
  `revoke all … from anon, authenticated` on the eight tables: the browser cannot read any table
  through PostgREST (students cannot read their transcripts, Canva notes or imported texts).
- The API (service role) gets explicit grants, since new Supabase projects no longer expose tables to
  the API roles by default: `usage` on schema `public`; `select, insert, update, delete` on all tables;
  `usage, select` on all sequences; `execute` on all functions. **A new migration must grant its new
  tables to `service_role`.**
- Deleting an auth user cascades to the profile, notes, lessons (and their sessions and reviews),
  practice sessions, review attempts and plans; audit and ledger rows stay with null references.
- The code tolerates missing optional 0006 tables (`lesson_plans`, `ai_generations`): plans are
  returned with `id: null`, ledger writes are skipped, stats fall back to `lessons.ai_usage`, the table
  explorer lists them as unavailable.

### Migrations

| File | Contents |
|---|---|
| `0001_lesson_pipeline.sql` | `profiles`, `student_notes`, `lessons`, `practice_sessions`, triggers, auth triggers, backfill |
| `0002_set_teacher.sql` | obsolete manual promotion (placeholder email, no effect as is): use `scripts/bootstrap-owner.mjs` |
| `0003_student_review.sql` | `lessons.generated_at`, `review_attempts` |
| `0004_backoffice.sql` | `lessons.ai_usage`, `admin_audit_log` (its admin promotion uses a placeholder email: use the script) |
| `0005_lesson_import.sql` | `source_kind`, `source_name`, `source_text`, `generation_options` |
| `0006_publishing_access_and_tools.sql` | `hidden`, `client_key`, `ai_context`, `client_run_id`, indexes, `lesson_plans`, `ai_generations` (+ `cost_usd`), pending trigger, lock-down, `service_role` grants |

---

## 4. Lesson contract

`utils/lesson/schema.js` is the single source of the data shapes; everything the AI returns goes
through its normalizers before it is stored, so the UI can trust the shapes.

### `lessons.content`

```js
{
  title: string,                                   // ≤ 120, default 'Lesson recap'
  summary: string,                                 // ≤ 4000, addressed to the student, paragraphs split by \n\n
  topics: string[],                                // ≤ 12
  vocabulary:  [{ fr, en, example }],              // ≤ 40
  corrections: [{ wrong, right, explanation }],    // ≤ 30, wrong ≠ right
  grammar:     [{ title, explanation, examples: string[] }], // ≤ 6 (the prompt asks for one)
  expressions: [{ fr, en, example }],              // ≤ 20
  homework:    [{ task, link }],                   // ≤ 8; link: https YouTube search / video, or ''
  can_do: string[],                                // ≤ 8, "Now I can …"
}
```

### `lessons.exercises`

Each exercise has a stable string `id` (`ex_1`, `ex_2`…); at most 20 (`MAX_EXERCISES`).

```js
{ id, type: 'mcq',        prompt, sentence /* at most one ___ */, choices: [3 strings], answer: 0|1|2, explanation }
{ id, type: 'fill_blank', prompt, sentence /* exactly one ___ */, answers: string[] /* 1–5 */, hint, explanation }
{ id, type: 'match',      prompt, pairs: [{ fr, en }] /* 3–6, unique fr and unique en */, explanation }
```

- The blank is stored as `___` (`BLANK`); `____` and `[blank]` are normalized. MCQ choices must be 3
  different strings (case-insensitive); AI output is shuffled so the answer moves.
- `choices`, `answers` and `pairs` are plain text without `**` (a highlighted choice would give the
  answer away); `prompt`, `sentence`, `hint` and `explanation` may contain `**word**`.

### Tutor plan (`lesson_plans.content`, teacher-only, French)

```js
{
  title: string, trial: boolean, duration_min: number,   // 15–120, default 50
  objectives: string[],                                   // "Maintenant je peux …"
  sections: [{ heading, minutes: number | null, body }], // body: multi-line text
  homework_questions: string[],                           // the 4 TRIAL_HOMEWORK_QUESTIONS, trial plans only
}
```

### Helpers (`schema.js`)

- `normalizeLessonContent(raw)`; `normalizeExercises(raw)` for AI output (drops invalid items, fixes
  what it can, ids `ex_1…ex_N`); `normalizePlanContent(raw, { trial })`.
- `normalizeExercisesForEdit(raw, { reservedIds, stored })` for human edits: keeps the order and the
  existing ids, never shuffles; missing, invalid or duplicate ids get the next `ex_N` after the highest
  one in the array and in `reservedIds` (so a new exercise never takes a removed one's id); an item
  identical to the stored exercise with its id (`stored`) is kept exactly as stored, even if it
  predates the current rules.
- `invalidEditedExercises(raw, { stored })` → 1-based positions of invalid items (untouched ones are
  never invalid); `stableJson(value)` (key-order-independent comparison).
- `safeHttpsUrl`, `safeDriveUrl` (https `drive.google.com` / `docs.google.com`), `safeHomeworkUrl`
  (https YouTube `/results?search_query=`, `/watch?v=`, `/shorts/…`, `youtu.be/…` only).
- `EXERCISE_TYPES` (`mcq`, `fill_blank`, `match`), `BLANK`, `LEVELS`, `MAX_EXERCISES`, `shuffle`,
  `STALE_GENERATION_MS` (5 min), `isStaleGeneration(lesson)`, `TRIAL_HOMEWORK_QUESTIONS`.
- `utils/lesson/sample.js`: `SAMPLE_LESSON`, a raw AI-shaped lesson with at least 4 exercises of each
  type (demo mode, prompt example, `/dev/preview`).

### Rich text

Text fields are plain text with optional `**highlight**`, `\n` (line break) and `\n\n` (paragraph).
Render them with `RichText` (blocks) or `RichTextInline` (`components/lesson/RichText.jsx`): `**…**`
becomes a `<mark>`, stray `**` are dropped, never shown raw, and no HTML is ever injected.

### Visibility, versions and progress

- A student sees their own lesson only when `status` is `published` or `generating`, `content` is
  not null and `hidden` is false (`visibleLessons()` in `utils/api/studentLessons.js`, used by every
  student route). A regeneration therefore keeps the previous version visible; drafts and first
  generations never show.
- `version` = `lessons.generated_at`. It changes with every successful generation and with every
  exercise edit that adds or changes an exercise (not for removals or reorders: results are recorded
  per exercise id).
- Progress (best score, attempts, mastery) and mistakes only count results recorded **at or after**
  `generated_at` (`utils/api/progress.js`): regenerating or editing the exercises restarts them.
  `last_practiced_at` counts every run; `updated_since_practice` = practised before, not since the
  current version.
- Student saves echo the version they played: a stale one gives 409 `lesson_updated` (practice) or
  counts in `skipped` (review). A save whose lesson is replaced between the check and the insert is
  undone (`lessonsReplacedSince()`).
- **Mistake** (`utils/api/mistakes.js`): an exercise of a visible lesson whose most recent current
  result (a practice answer or a review attempt; the review wins a tie) is wrong. Ordered newest
  lesson first, then exercise order. Only the answers of the newest current runs of each lesson are
  loaded (`withMistakeAnswers()`), so the cost follows the number of lessons, not the history.
- **Word bank** (`collectVocabulary()`): vocabulary then expressions of the visible lessons, newest
  first, one entry per French word, deduplicated with `foldFrench()` (case, accents, apostrophes,
  punctuation, œ/æ and `**` ignored); the newest lesson's version is kept and `lessonIds` lists every
  lesson it appears in. `wordCount` and `vocab_count` use the same rule.

### Grading (`utils/lesson/grading.js`)

Shared by the player (instant feedback) and the API (which re-grades instead of trusting the client).

- Answer values: `mcq` → chosen index; `fill_blank` → typed text (≤ 200 characters stored);
  `match` → `{ mistakes }` (pairs only lock when right; correct when 0).
- `gradeAnswer(exercise, value)` → `{ correct, accentWarning, expected }`, where `expected` is the
  accepted answer closest to what was typed. `scoreSession(exercises, answers)` →
  `{ score, total: exercises.length, answers: [{ exerciseId, value, correct }] }`; only the first
  answer per exercise counts, unknown ids are ignored.
- Normalization: lower case (NFC), `**` and quotes dropped, apostrophes unified, spaces collapsed,
  trailing `. ! ? , ; :` ignored; `œ`/`oe`, `æ`/`ae` and hyphen/space are equivalent.
- **Accent policy**: an answer that differs from an accepted one only by accents is accepted with
  `accentWarning: true`, **except** when the accent changes the word, which is graded wrong: words of
  ≤ 3 letters (a/à, ou/où, la/là, du/dû), known minimal pairs (sur/sûr, jeune/jeûne, tache/tâche,
  mais/maïs, cote/côte, foret/forêt, pêche, boîte, tête…), an accent slip on the last letter
  (parlé/parle) and the endings -é, -ée, -és, -ées (allée/allee).
- Score integrity: the correct answers are in the lesson payload (instant feedback, works on bad
  networks, formative self-practice). A determined student could post a perfect run: accepted risk.
  The server re-grades, and saves are idempotent (`runId`) and version-checked.

---

## 5. AI

### Configuration (`utils/ai/client.js`)

- `aiConfig()` reads the env (§1). `isDemoMode()`: outside production only, with no `AI_API_KEY` or
  `AI_DEMO=1` → canned output (`SAMPLE_LESSON`, `SAMPLE_PLAN`, `SAMPLE_TRIAL_PLAN`) after a short
  delay, model `'demo'`, no usage. In production a missing key fails with « IA non configurée… ».
- `chatJSONWithUsage({ system, user, timeoutMs })`: `POST <AI_BASE_URL>/chat/completions` with
  `temperature: 0.4`, `max_tokens`, `response_format: { type: 'json_object' }` (dropped and retried if
  the provider rejects it) and, for OpenRouter, `usage: { include: true }` (the real cost comes back
  as `usage.cost`, USD). One retry on a network error, a 429 / 5xx, or a provider error inside a 200
  answer. The JSON is extracted robustly (code fences, `<think>`, balanced braces, trailing commas,
  raw line breaks in strings).
- Errors are `AiError` with a short French message (stored in `lessons.error`, never secrets) and a
  code: `timeout`, `network`, `auth`, `credit`, `quota`, `unavailable`, `notFound`, `rejected`,
  `filtered`, `invalidJson`, `truncated`, `config`, `unusable`. The timeout message adds advice that
  fits the source (shorten the transcript / split the document).
- `chatSession()` shares one deadline (`AI_TIMEOUT_MS`) and one usage total between the first call and
  its retries; the first call is asked again once when its JSON was unparsable or cut off.

### Lesson generation (background, 202)

1. The route (create, import, regenerate) validates the request, then inserts the row in
   `generating` (`insertGeneratingLesson`, idempotent on `(student_id, client_key)`) or claims it
   (regenerate: conditional update `status <> 'generating' or updated_at < now − 5 min`), and answers
   **202** `{ lesson: { id, status: 'generating', error: null } }` at once.
2. `startLessonGeneration()` → `runInBackground()` (`utils/api/background.js`): the promise is handed
   to Vercel's `waitUntil` (request-context global), which keeps the function alive up to the route's
   `maxDuration = 300` (Fluid compute required); under `next start` / `next dev` the process simply
   keeps running. Errors are logged, never thrown.
3. `runLessonGeneration()` loads the context: profile (name, level, goals, interests),
   `student_notes.ai_context`, and the 3 previous published lessons dated on or before this one
   (title, date, vocabulary). It never reads `student_notes.notes`.
4. `generateLesson()` (`utils/ai/generateLesson.js`): builds the prompt (mode `transcript` or
   `import`), makes the first call, and — when the result is incomplete (fewer than `count − 2`
   exercises, or fewer than 8 for the default mix; a requested type missing; no summary) and at least
   30 s of budget remain — one corrective call listing the problems; the better result is kept.
   `toResult()` keeps only the requested types, caps to `count` while keeping one exercise of each
   type, and renumbers `ex_1…ex_N`. At least 4 valid exercises (or `count` if smaller) and a summary
   are required, else `AiError('unusable')`.
5. The result is written only while the row is still `generating` (`writeWhileGenerating`, one retry):
   a lesson deleted meanwhile is not recreated, and a status set meanwhile (back office) wins.
   Success: `status: 'published'`, `error: null`, `content`, `exercises`, `ai_model`, `ai_usage`,
   `generated_at: now`, and `title` = a title the teacher typed during the run, else the teacher's
   title from the request (regenerate: the current title if it differs from the previous AI title),
   else the AI title. `hidden` is never touched: it is the teacher's choice.
6. Failure: `status` = `published` if the row already had content (a failed **regeneration** keeps
   the previous version for the student; its `error` shows on the teacher dashboard until dismissed
   with `dismissError`), else `failed`; `error` = the French message. A result that cannot be saved
   becomes a failure (« La leçon générée n'a pas pu être enregistrée… »). If even that write fails,
   the row stays `generating` and becomes stale.
7. One `ai_generations` row is always recorded (below).

- **Stale rule**: `isStaleGeneration(lesson)` = status `generating` and `updated_at` older than
  5 minutes (`STALE_GENERATION_MS`). A stale row can be regenerated and deleted, is listed in the
  dashboard's « À traiter », stops the pages' polling, and the back office must give it a status with
  any save. Any update of the row (e.g. a title or visibility change during a generation) refreshes
  `updated_at` and so postpones stale detection: there is no separate start column.
- **Polling**: the teacher's lesson page and the import queue poll `GET /api/teacher/lessons/[id]?light=1`
  every 4 s (slower after errors; the lesson page pauses in hidden tabs) until `published`, `failed`
  or `stale`, then the lesson page loads the full lesson once.
- **Idempotency**: create and import require a `clientKey` (uuid made by the browser, kept in the
  draft or the import row). The same `(student, clientKey)` returns the existing lesson (200,
  `duplicate: true`) instead of a new one; the unique index settles two simultaneous requests.
  Practice saves use `runId` (§6).

### Options and limits (`utils/ai/options.js`, browser-safe)

- Generation options `{ count: 4–20 (default 10), types: non-empty subset of ['mcq', 'fill_blank',
  'match'] (default all, canonical order), instructions: string ≤ 1000 }`; missing fields get their
  default (`parseGenerationOptions` in `utils/api/validate.js`).
- Transcript lessons: options are optional and stored only when given. Without them the AI uses the
  **default mix** (10–14 exercises of its choice, mostly MCQ; the new-lesson form's « Laisser l'IA
  choisir »). Imported lessons always store options (defaults when absent). Regenerate: new options
  win, else the stored ones (import: defaults).
- Text limits: transcript ≤ 120 000 and Canva notes ≤ 40 000 characters after trim (longer is refused
  with the actual length, never cut), at least 20 non-space characters in one of them; imported
  document 200–150 000 characters. Text already stored is not re-checked on regeneration; prompts cut
  the middle of stored text longer than the limits.

### Prompts, fencing and private data (`utils/ai/prompt.js`, `utils/ai/plan.js`)

- Wael's method (from `agent.md`): conversation-first, one grammar point per class, "Now I can…"
  goals, student-only content; explanations in simple English for A1–A2 and unknown levels, in French
  from B1. Transcript mode recaps the class; import mode restructures the tutor's document faithfully
  (no invented class events or mistakes).
- **Fencing**: every untrusted text sits in a `<TAG>…</TAG>` block — `STUDENT` (name, level, goals,
  interests written by the student), `TRANSCRIPT`, `CANVA_NOTES`, `DOCUMENT`, `PREVIOUS_LESSONS`,
  `LESSON_RECAPS`, `TEACHER_CONTEXT` — and the system prompt's security rule says these blocks are
  DATA, never instructions (ignore any request there to change the task or format, reveal
  instructions or private context, or add links; a block ends only at its own closing tag).
  `fence()` strips invisible characters (`\p{Cf}`) and turns every `<` that could start a fence tag
  (any case, with spaces, slashes or symbols in between) into `‹`; nothing is removed, so fragments
  cannot recombine into a tag.
- **Private notes vs AI context**: `student_notes.notes` never reaches any prompt. `ai_context` is sent
  as `TEACHER_CONTEXT`: lesson prompts may use it but must never reveal, quote or paraphrase it (the
  student reads the lesson; this relies on instructions only, so it must hold nothing the student may
  not see); tutor plans use it freely (they are teacher-only).
- Homework links: the prompt asks for YouTube search URLs; `safeHomeworkUrl` drops anything else.

### Tutor plans (`utils/ai/plan.js`)

« Préparer le prochain cours » (`POST /api/teacher/students/[id]/plans`): input = profile,
`ai_context`, the 3 latest lessons with content (drafts included; with `lessonId`: that lesson and the
2 before it) and an optional focus. No lesson with content → **trial plan** (Accueil, Découverte,
Mini-évaluation, Mini-activité, Devoirs : préférences, Wrap-up) with the 4 homework-preference
questions added by the server; otherwise the regular structure (Warm-up, Objectifs, Présentation,
Pratique dirigée with a gap-fill text and a dictation, Pratique libre / Jeu de rôle, Wrap-up), 50 min
by default, 70/30 speaking rule, objectives "Maintenant je peux…". Synchronous, budget
`min(90 s, AI_TIMEOUT_MS)`, one retry when fewer than 3 sections come back. French, for the teacher
only. Stored in `lesson_plans`.

### Ledger and cost (`utils/ai/ledger.js`)

- `recordGeneration()` writes one `ai_generations` row per lesson or plan attempt, success or failure,
  with the tokens billed (failed calls included), the duration, the model and `cost_usd` when OpenRouter
  reported it. Best effort: a missing table skips it, a deleted lesson or account keeps the row
  without references, a database without `cost_usd` gets the row without the cost.
- `lessons.ai_usage` keeps the usage of the lesson's current version.
- `GET /api/admin/stats` (`utils/api/admin/stats.js`): real spend from the ledger — the provider cost
  where known, tokens × `AI_PRICE_*` otherwise (`cost_source`: `provider`, `mixed` or `estimate`) —
  plus failures, failure rate, average duration and calls per kind; when the ledger is unavailable it
  falls back to `lessons.ai_usage` (`source: 'lessons'`, a lower bound).

---

## 6. API reference

33 route files under `pages/api/` (`find pages/api -name '*.js'`). All take and return JSON unless
stated. Common answers, not repeated below:

| Status | When |
|---|---|
| 405 | method not listed (`Allow` header), `{ error: 'Method Not Allowed' }` |
| 401, 503, 403 (`cross_site`, `banned`, `pending`) | `requireUser` (§2); every route |
| 403 | not a teacher (`requireTeacher`), not an admin (`requireAdmin`), a teacher on a student route |
| 415 `unsupported_media_type` | back-office write without a JSON body |
| 400 | validation, `{ error }` with a readable message |
| 500 | generic message; details in the server logs |

Types used below:

- `Profile` = `PROFILE_FIELDS` (`utils/supabase/profiles.js`):
  `{ id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at, updated_at }`.
- `GenerationOptions` = `{ count?, types?, instructions? }` (§5).
- `LessonSummary` = `{ id, status, error }`.
- `Plan` = the tutor plan shape (§4).

### Common

**`GET /api/me`** — `pages/api/me.js` · any signed-in user, **pending accounts included**.
- → `{ user: { id, email }, role: 'student'|'teacher', approved: boolean, isAdmin: boolean, profile: Profile|null }`,
  `Cache-Control: private, no-store`.

**`POST /api/onboarding/complete`** — `pages/api/onboarding/complete.js` · students (teachers 403
`Onboarding is for students only.`; pending → 403 `pending`).
- Body `{ fullName, level, goals?, interests? }`: `fullName` required, non-empty, ≤ 120; `level` in
  `LEVELS`; `goals`, `interests` ≤ 1000 (`''` → null).
- → `{ profile: Profile }`. Upsert; a second submit keeps the first `onboarded_at`; syncs
  `user_metadata.full_name` (best effort).
- 400 (English): `Please enter your name.`, `Please choose your level.`, length messages.

### Student

All: `requireUser` (English errors), teachers get 403 (`This page is for students.` or
`Practice is for students.`), pending accounts 403 `pending`. Queries are scoped to the session's
user and go through `visibleLessons()`.

**`PATCH /api/student/profile`** — `pages/api/student/profile.js`
- Body: any of `{ fullName, level, goals, interests }` (same rules as onboarding; `fullName` non-empty
  when sent).
- → `{ profile: Profile }`; syncs `user_metadata.full_name` when it changes.
- 400 `Nothing to update.` / validation; 404 `Profile not found.`.

**`POST /api/student/deleteProfile`** — `pages/api/student/deleteProfile.js`
- No body. Deletes the auth user; profile, notes, lessons, sessions, reviews and plans cascade.
- → `{ success: true }`.
- 403 `This account cannot be deleted here.` for teachers and admins (managed in the back office,
  which protects the last teacher and admin); pending accounts get 403 `pending` (the teacher refuses
  them instead).

**`GET /api/student/lessons`** — `pages/api/student/lessons/index.js`
- → `{ driveFolderUrl: string|null, mistakeCount, wordCount, lessons: [{ id, title, lesson_date, version,
  exercise_count, vocab_count, best_score, best_total, attempts, last_practiced_at, updated_since_practice }] }`.
- Visible lessons, `lesson_date` then `created_at` newest first. `best_score` / `best_total` null and
  `attempts` 0 without a run of the current version; `last_practiced_at` over every run;
  `mistakeCount` and `wordCount` as in §4.

**`GET /api/student/lessons/[id]`** — `pages/api/student/lessons/[id]/index.js`
- → `{ lesson: { id, title, lesson_date, version, content, exercises, drive_url, updated_since_practice },
  progress: { best_score, best_total, attempts, last_practiced_at } }`.
- `exercises` include the answers (instant feedback, §4). `version` must be echoed when saving a run.
- 404 `Lesson not found.` unless the lesson is the student's own and visible.

**`POST /api/student/lessons/[id]/practice`** — `pages/api/student/lessons/[id]/practice.js`
- Body `{ answers: [{ exerciseId, value }], version: string, runId: uuid }`: at most 100 answers,
  `exerciseId` strings (cut to 40), values cleaned (numbers, booleans, strings ≤ 200, `{ mistakes }`);
  `version` = the lesson's `version` (≤ 64); `runId` made by the player.
- → `{ score, total, bestScore, bestTotal, duplicate?: true }`. The server re-grades
  (`scoreSession`, first answer per exercise, `total` = number of exercises) and stores the run with
  `client_run_id`; `bestScore` / `bestTotal` = best current-version run, this one included. The same
  `runId` again returns the stored result with `duplicate: true`.
- 400: `answers must be an array.`, `Too many answers (max 100).`, `No valid answers to grade.`,
  `This page is out of date. Please reload it and try again.` (missing `version` or `runId`),
  `Invalid run id.`.
- 404 `Lesson not found.` (malformed id).
- 409 `lesson_unavailable` (`This lesson isn’t available anymore.`): hidden, deleted or not the
  student's.
- 409 `lesson_updated` (`This lesson was just updated by your teacher.`): `version` ≠ `generated_at`;
  none of the answers matches a current exercise (removed during the run); or the lesson was replaced
  between the check and the insert (the run is deleted). A retry of a run stored before an update
  still gets its stored result; one stored after it is deleted and gets the 409.

**`GET /api/student/review`** — `pages/api/student/review.js`
- → `{ total, exercises: [{ ...exercise, id: '<lessonId>:<exerciseId>', lessonId, lessonTitle, lesson_date, version }] }`.
- Current mistakes (§4), newest lessons first, at most 20 per round; `total` = every current mistake.

**`POST /api/student/review`** — same file
- Body `{ answers: [{ exerciseId: '<lessonId>:<exerciseId>', value, version? }] }` (≤ 50 answers).
- → `{ score, total, remaining, skipped }`. First answer per exercise; each graded answer inserts one
  `review_attempts` row. `skipped` = well-formed answers the server can no longer grade: lesson not
  visible any more, exercise removed, `version` changed, or lesson replaced during the save (those
  rows are deleted). `total` = graded answers; `remaining` = current mistakes after the save.
- 400 `No valid answers to grade.` only when no answer was well-formed (plus array / size messages).
  No idempotency key: a retried round may log duplicate attempts (mistakes stay right, the newest
  result wins).

**`GET /api/student/vocabulary`** — `pages/api/student/vocabulary.js`
- → `{ items: [{ fr, en, example, kind: 'word'|'expression', lessonId, lessonTitle, lesson_date, lessonIds: string[] }],
  lessons: [{ id, title, lesson_date }] }` — the word bank (§4) and the visible lessons that have
  words (flashcard deck picker).

### Teacher

All: `requireTeacher` (French errors, cross-site writes refused), preceded by `allowSameOrigin` except
on the two `import/*` routes. "Student" means a student account that is not an admin (§2); anything
else answers 404.

**`GET /api/teacher/overview`** — `pages/api/teacher/overview.js` (dashboard)
- → `{ attention: { failed: [L], stale: [L], drafts: [L], regenFailed: [L] },
  inactive: [{ id, full_name, email, last_lesson_date, days }],
  activity: [{ student_id, student_name, lesson_id, lesson_title, score, total, completed_at }],
  pending: [{ id, email, full_name, created_at, provider }] }`,
  with `L = { id, title, lesson_date, student_id, student_name, error, updated_at }`.
- `attention` lists (20 max each): `failed` = status failed (newest update first); `stale` =
  generating for more than 5 min (oldest first); `drafts` = hidden published lessons with content
  (newest date first); `regenFailed` = published lessons with an error, i.e. a failed regeneration
  (newest first).
- `inactive`: approved, non-suspended students with a profile whose last lesson is more than 14 days
  old, or who have none and joined more than 7 days ago; most days first.
- `activity`: practice sessions of the last 7 days (20 newest).
- `pending`: self sign-ups waiting for approval (not suspended), newest first; `provider` = `google`,
  `email`…

**`GET /api/teacher/students`** — `pages/api/teacher/students/index.js`
- → `{ students: [{ id, email, full_name, level, onboarded_at, created_at, lesson_count, last_lesson_date,
  approved, last_sign_in_at, email_confirmed }] }` — approved student accounts with a profile, newest
  first (pending accounts are in `overview.pending`; admins never appear).

**`POST /api/teacher/students/invite`** — `pages/api/teacher/students/invite.js`
- Body `{ email, fullName? (≤ 120), sendEmail?: boolean = false }`.
- → **201** `{ student: { id, email, full_name }, link: string|null }` (`link` null with `sendEmail`).
  Creates an approved student account (§2). Audit `user.invite` (`via: 'teacher'`,
  `delivery: 'link'|'email'`).
- 400 `Adresse e-mail invalide.`; 409 `email_exists` (any existing account, left untouched); 429
  `rate_limited` (Supabase email limit, with `sendEmail`); 500 when `NEXT_PUBLIC_SITE_URL` is missing
  on a back-office host.

**`GET /api/teacher/students/[id]`** — `pages/api/teacher/students/[id]/index.js`
- → `{ student: { id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at,
  approved, last_sign_in_at, email_confirmed }, notes: string, ai_context: string,
  lessons: [{ id, title, lesson_date, status, stale, error, hidden, source_kind, exercise_count, created_at,
  updated_at, best_score, best_total, attempts }] }`.
- Every lesson (drafts and failures included), newest first; progress counts current-version runs
  only. Also answers for pending accounts.
- 404 `Élève introuvable.`.

**`PATCH /api/teacher/students/[id]`** — same file
- Body: any of `{ fullName (≤ 120, '' clears), level, goals, interests (≤ 1000), driveFolderUrl
  (https drive.google.com / docs.google.com; '' or null clears), notes (≤ 10 000), aiContext (≤ 4000) }`.
- → same shape as GET. Only the columns sent are written (saving `notes` never clears `ai_context`);
  `fullName` also syncs `user_metadata.full_name`.
- 400 `Aucune modification à enregistrer.` / validation; 404 (not a student, or no profile).

**`POST /api/teacher/students/[id]/approve`** — `…/approve.js`
- → `{ student: { id, email, full_name, approved: true } }`. Audit `user.approve` (`via: 'teacher'`).
- 400 `Ce compte est déjà approuvé.`; 404 `Compte introuvable.`.

**`POST /api/teacher/students/[id]/reject`** — `…/reject.js`
- Deletes a pending account. → `{ success: true }`. Audit `user.delete`
  (`reason: 'pending_rejected'`, `via: 'teacher'`).
- 400 `Seul un compte en attente peut être refusé.`; 404.

**`POST /api/teacher/students/[id]/sign-in-link`** — `…/sign-in-link.js`
- → `{ link }` — one-time `magiclink` to `/auth/confirm`, not emailed (§2). Audit `user.sign_in_link`
  (without the link).
- 400: pending account (approve it first), suspended account, no email; 404 for anything but a
  student account.

**`GET /api/teacher/students/[id]/plans`** — `…/plans.js`
- → `{ plans: [{ id, focus, content, created_at }] }` — the 10 latest (`[]` without the table).

**`POST /api/teacher/students/[id]/plans`** — same file · `maxDuration: 300`
- Body `{ focus?: string ≤ 1000, lessonId?: uuid }` (`lessonId`: plan the class right after that
  lesson).
- → **201** `{ plan: { id: string|null, focus: string|null, content: Plan, created_at } }` —
  synchronous AI call (about 90 s at most, §5); `id` null when `lesson_plans` is missing. Ledger row
  `kind: 'plan'` either way.
- 400 `Leçon invalide.` / focus too long; 404 (student, or `Leçon introuvable pour cet élève.` when
  `lessonId` is not one of this student's lessons with content); 502 `ai_failed` (French AI message).

**`POST /api/teacher/lessons`** — `pages/api/teacher/lessons/index.js` · `maxDuration: 300`, body ≤ 2 MB
- Body `{ studentId, lessonDate: 'YYYY-MM-DD', title? (≤ 120), transcript, canva, clientKey: uuid,
  publish?: boolean = true, options?: GenerationOptions }`.
- → **202** `{ lesson: { id, status: 'generating', error: null } }`; the AI runs in the background
  (§5). Same `clientKey` again → **200** `{ lesson: LessonSummary, duplicate: true }`.
  `publish: false` creates a hidden draft. `options` are stored only when sent.
- 400: `Élève invalide.`, date, title, sources (lengths and minimum, §5), `Requête incomplète
  (clientKey manquant)…`, options, `publish`; 404 `Élève introuvable.` (not an approved student
  account with a profile: pending accounts and admins included).

**`POST /api/teacher/lessons/import`** — `pages/api/teacher/lessons/import.js` · `maxDuration: 300`, body ≤ 1 MB
- Body `{ studentId, lessonDate, title?, sourceName?, text, options?, clientKey, publish? }`:
  `sourceName` is trimmed and cut to 200 characters (a label, never refused); `text` 200–150 000
  characters.
- → **202** / **200** duplicate, as above. `source_kind: 'import'`, `source_name`, `source_text`,
  options stored (defaults when absent), no transcript or Canva.
- 400 / 404 as above (`Le texte du document est trop court / trop long…`).

**`GET /api/teacher/lessons/[id]`** — `pages/api/teacher/lessons/[id]/index.js`
- → `{ lesson: TeacherLesson, sessions: [{ score, total, completed_at }], older_sessions_count }` with
  `TeacherLesson = { id, student_id, student_name, student_level, title, lesson_date, status, stale, error,
  hidden, content, exercises, drive_url, transcript, canva, ai_model, generated_at, created_at, updated_at,
  source_kind, source_name, source_text, generation_options }`. `sessions` = runs of the current
  version (at or after `generated_at`), newest first; `older_sessions_count` = older runs.
- `?light=1` → `{ lesson: { id, status, error, stale, hidden, title, updated_at } }` (polling payload,
  without sources, content or sessions).
- 404 `Leçon introuvable.`.

**`PATCH /api/teacher/lessons/[id]`** — same file · body ≤ 1 MB
- Body: any of
  - `title` (non-empty, ≤ 120), `lessonDate`, `driveUrl` (https Drive / Docs; `''` or null clears);
  - `hidden: boolean` — « Publier pour l'élève » / « Retirer de l'espace élève »;
  - `dismissError: true` — clears the error of a failed regeneration on a published lesson (it
    leaves « À traiter »);
  - `removeExerciseIds: string[]` (≤ 100 ids of ≤ 40 characters) — the other exercises keep their
    ids and `generated_at` is kept;
  - `exercises` — the full edited array (≤ 20), exclusive with `removeExerciseIds`;
  - `expectedUpdatedAt` (ISO) — the `updated_at` the editor started from;
  - `version` (string or null) — the `generated_at` the page shows, meant to go with
    `removeExerciseIds` (every regeneration numbers exercises `ex_1…` again). Optional: the lesson
    page currently sends removals without it.
- → `{ lesson: TeacherLesson }` (no sessions).
- Exercise edits: every changed item must be valid (400 listing the positions, « Les exercices n° 1,
  3 sont incomplets ou invalides… »); untouched items are kept as stored; new items never reuse a
  stored id; `generated_at` moves forward when an exercise is added or changed (progress restarts),
  not for removals or reorders (`exercisesResetProgress()`).
- Concurrency: exercise changes, and any patch with `expectedUpdatedAt`, are written only if
  `updated_at` did not change since the read; a pure removal is retried once on a fresh read of the
  same version. Title, date, link and visibility may change during a generation (a title typed then
  is kept by the pipeline).
- 400 `Aucune modification à enregistrer.`, both exercise fields sent, validation; 404; 409
  `conflict` (changed since `expectedUpdatedAt` or `version`, or during the write); 409 `generating`
  (exercise change while a non-stale generation runs).

**`DELETE /api/teacher/lessons/[id]`** — same file
- → `{ success: true }` (sessions and review attempts cascade).
- 409 `generating` while a non-stale generation runs; 409 `conflict` when the row keeps changing
  under the delete; 404.

**`POST /api/teacher/lessons/[id]/regenerate`** — `…/[id]/regenerate.js` · `maxDuration: 300`, body ≤ 2 MB
- Body `{ transcript?, canva?, options? }`. Transcript lessons: a source sent replaces the stored one
  (length-checked), a missing one keeps the stored text. Imported lessons regenerate from
  `source_text` (transcript and Canva ignored). New `options` are stored; otherwise the stored options
  are used (imports: defaults).
- → **202** `{ lesson: { id, status: 'generating', error: null } }`. `hidden` is unchanged; the
  student keeps the previous version meanwhile, and if it fails.
- 400 `Le texte du document importé est introuvable…`, sources, options; 404; 409 `busy` (a
  generation started less than 5 minutes ago, or lost the claim to a concurrent request).

**`POST /api/teacher/import/extract`** — `pages/api/teacher/import/extract.js` · body parser off, `maxDuration: 60`
- Raw PDF body (the page sends `Content-Type: application/pdf` and the URI-encoded file name in
  `X-File-Name`), at most 4 MB. The file is recognized by its `%PDF-` signature.
- → `{ sourceName, text, pages: number, warning: string|null }`: text extracted with `unpdf` and
  cleaned (repeated header/footer lines holding a date, number, URL or © removed by position, page
  numbers, control characters). `warning` (French): very little text (probably scanned), more than
  half of the pages without text, or truncated at 150 000 characters; `text` may be `''`.
  `sourceName` = the sanitized file name (`Document PDF` by default).
- 413 `Fichier trop volumineux (4 Mo max).`; 400 `Aucun fichier reçu.`, `Ce fichier n'est pas un
  PDF.`, password-protected or unreadable PDF.

**`POST /api/teacher/import/resolve`** — `pages/api/teacher/import/resolve.js` · `maxDuration: 60`
- Body `{ url }`: a Google Docs link (`docs.google.com/document/d/<id>`) or a Drive file link
  (`drive.google.com/file/d/<id>`, `open?id=`, `uc?id=`, old `docs.google.com/open?id=`); optional
  `/u/N` segment; `resourcekey` kept; `http` upgraded to `https`. Parsed by `utils/import/googleLinks.js`
  (shared with the page).
- → `{ sourceName, text, pages: number|null, warning: string|null }`.
- The server never fetches the pasted URL: it rebuilds the download URL from the id (Docs
  `…/export?format=txt`, Drive `uc?export=download&id=…`), 20 s timeout, 15 MB max, redirects
  followed by hand (at most 5, https Google hosts only: `docs.google.com`, `drive.google.com`,
  `drive.usercontent.google.com`, `*.googleusercontent.com`; `accounts.google.com` = not public).
  Drive files: PDF, or `.txt` / `.md` (served as text, or as `application/octet-stream` with that
  extension). A Drive link to a native Google Doc falls back to the Docs export.
- 400 (French): invalid link, other host, Drive folder, Drive page, « Publié sur le Web » link,
  Sheets / Slides / Forms, not shared publicly (« Tous les utilisateurs disposant du lien »), not
  found, too large, unsupported Drive file type (Word: open it in Docs or export a PDF), unexpected
  redirect; 502: Google timeout, unreachable or failing.

### Back office

All: `requireAdmin` (French errors); writes also `assertJsonBody` (415) and record an audit entry
after they succeed (`logAdminAction`, `utils/api/audit.js`). Lists take `page` (1-based) and
`perPage` (default 50, max 200); a page past the end returns the last page and the answer's `page` is
the one actually returned. Searches (`q`) are case-insensitive substrings with `%`, `_`, `\` and `"`
escaped; `*` matches exactly one character (PostgREST cannot match it literally).

**`GET /api/admin/stats`** — `pages/api/admin/stats.js`
- →

  ```js
  {
    totals: { users, students, teachers, admins, pending_approval, invites_pending, onboarded, lessons,
              lessons_published, lessons_failed, lessons_hidden, practice_sessions, review_attempts },
    last30: { days: ['YYYY-MM-DD' ×30, oldest first, UTC], signups: number[], lessons: number[],
              sessions: number[], generations?: number[] },
    successRate: number | null,
    ai: AiSummary,
    recent: {
      lessons: [{ id, title, student_id, student_name, status, hidden, created_at }], // 5 newest
      signups: [{ id, email, full_name, approved, created_at }],                        // 5 newest
    },
  }
  ```

- `onboarded` counts students only; `invites_pending` = approved accounts that never signed in or
  never confirmed their email; `successRate` = mean of score / total over every run, 0–100;
  `last30.generations` only with the ledger.
- `AiSummary = { source: 'ledger'|'lessons', calls, failures, failure_rate, avg_duration_ms, by_kind: { lesson?, plan? },
  prompt_tokens, completion_tokens, cost_usd, cost_source: 'provider'|'mixed'|'estimate', provider_cost_usd,
  provider_cost_calls, estimated_calls, estimated_cost_usd, price_input_per_m, price_output_per_m }`
  (`failures`, `failure_rate`, `avg_duration_ms` null with `source: 'lessons'`; §5).

**`GET /api/admin/users`** — `pages/api/admin/users/index.js`
- Query `q` (email or name), `role` (`all`, `student`, `teacher`, `admin`, `pending`), `sort`
  (`full_name`, `email`, `role`, `level`, `onboarded_at`, `lesson_count`, `session_count`,
  `created_at`, `last_sign_in_at`; default `created_at` descending, other columns ascending), `dir`
  (`asc`, `desc`), `page`, `perPage`.
- → `{ users: [AdminUserItem], total, page, perPage }` with `AdminUserItem = { id, email, full_name, role,
  is_admin, level, onboarded_at, created_at, last_sign_in_at, banned, approved, email_confirmed,
  invite_pending, lesson_count, session_count }`. Empty values sort last in both directions.
- 400 on an unknown `role`, `sort` or `dir`.

**`POST /api/admin/users`** — same file
- Body `{ email, fullName?, role: 'student'|'teacher', isAdmin?: boolean, sendEmail?: boolean }`.
- → **201** `{ user: AdminUserItem, link: string|null }` (§2 invitation). Audit `user.invite`.
- 400 (email, role, booleans); 409 `email_exists`; 429 `rate_limited`.

**`GET /api/admin/users/[id]`** — `pages/api/admin/users/[id]/index.js`
- → `{ user: { id, email, created_at, last_sign_in_at, invited_at, role, is_admin, banned, approved,
  email_confirmed, invite_pending, providers: string[] }, profile: Profile|null, notes, ai_context,
  lessons: [{ id, title, lesson_date, status, hidden, exercise_count, best_score, best_total, attempts }],
  sessions: [{ id, lesson_id, lesson_title, score, total, completed_at }] /* 50 latest */,
  reviews: [{ id, lesson_id, exercise_id, correct, created_at, lesson_title }] /* 50 latest */ }`.
- Progress counts current-version runs only. 404 `Utilisateur introuvable.`.

**`PATCH /api/admin/users/[id]`** — same file
- Body: any of `{ role: 'student'|'teacher', isAdmin, banned, resetOnboarding: true, fullName, level,
  goals, interests, driveFolderUrl, notes, aiContext }` (same limits as the teacher's student PATCH).
- → same shape as GET. `banned` sets `ban_duration` (`876000h` / `none`); `resetOnboarding` clears
  `onboarded_at`; `fullName` also syncs `user_metadata.full_name`. Audit `user.update` with the
  changes (`from` / `to`; notes and AI context as `{ changed, length }`), recorded even if a later step
  fails (`incomplete: true`).
- 400: nothing to update, validation, changing your own role, removing your own admin flag, banning
  yourself, removing the last active admin or the last active teacher (banned accounts do not count).

**`DELETE /api/admin/users/[id]`** — same file
- Body `{ confirmEmail }` (must equal the account's email, case-insensitive). → `{ success: true }`;
  everything cascades. Audit `user.delete`.
- 400: wrong confirmation, deleting yourself, the last active admin or teacher; 404.

**`POST /api/admin/users/[id]/approve`** — `…/approve.js`
- Body `{}`. Approves a pending account. → `{ success: true }`. Audit `user.approve`.
- 400 `Ce compte est déjà approuvé.`; 404.

**`POST /api/admin/users/[id]/sign-in-link`** — `…/sign-in-link.js`
- Body `{}`. → `{ link }` (one-time `magiclink`, not emailed). Audit `user.sign_in_link` (without the
  link).
- 400: your own account (use `/login`), another admin (no impersonation), a pending or suspended
  account, no email; 404.

**`GET /api/admin/lessons`** — `pages/api/admin/lessons/index.js`
- Query `q` (title, or the student's name or email: up to 100 matching students), `status`
  (`generating`, `published`, `failed`), `studentId` (uuid), `page`, `perPage`.
- → `{ lessons: [{ id, title, lesson_date, status, hidden, student_id, student_name, exercise_count, ai_model,
  created_at, updated_at }], total, page, perPage }`, newest first.
- 400 on an invalid `status` or `studentId`.

**`GET /api/admin/lessons/[id]`** — `pages/api/admin/lessons/[id].js`
- → `{ lesson: AdminLesson, sessions: [{ id, score, total, completed_at, current }], review_count }` with
  `AdminLesson = { id, student_id, student_name, title, lesson_date, status, stale, error, hidden, content,
  exercises, drive_url, transcript, canva, source_kind, source_name, source_text, generation_options,
  ai_model, ai_usage, generated_at, created_at, updated_at }`. `sessions` = every run, newest first;
  `current` = recorded at or after `generated_at`.
- 404 `Leçon introuvable.`.

**`PATCH /api/admin/lessons/[id]`** — same file · body ≤ 2 MB
- Body: any of `{ title, lessonDate, status: 'published'|'failed', studentId, hidden, driveUrl, content,
  exercises, expectedUpdatedAt }`.
- → `{ lesson: AdminLesson }`. A patch that changes nothing writes nothing and is not audited;
  otherwise audit `lesson.update` with a compact diff (plain fields `from` / `to`, content list
  counts, exercise ids added / removed, `progress_reset`).
- Rules:
  - While a non-stale generation runs only `hidden` may change (else 409 `generating`); a stale
    ("stuck") generation needs a `status` with any save (400 « Génération bloquée : choisis aussi un
    statut… »), which ends it.
  - A status change sets `error`: cleared when published, kept or set to « Marquée en échec depuis le
    back office. » (« Génération interrompue (bloquée) : … » for a stuck one) when failed. Publishing
    requires content.
  - `studentId` must be an approved student account (not admin) and the lesson must have no practice
    session or review attempt (400 otherwise).
  - `content` is checked strictly (400 listing what the normalizer would drop: incomplete items, too
    many items, refused homework links — YouTube only), then normalized.
  - `exercises`: same rules as the teacher PATCH (changed items strict, untouched items kept as
    stored, reserved ids, progress reset decided on normalized exercises; 400 listing positions).
  - Optimistic concurrency: 409 `conflict` when `updated_at` differs from `expectedUpdatedAt` or
    changes during the save.
- 404.

**`DELETE /api/admin/lessons/[id]`** — same file
- → `{ success: true }` (sessions and review attempts cascade). Audit `lesson.delete`. 404.

**`GET /api/admin/tables`** — `pages/api/admin/tables/index.js`
- → `{ tables: [{ name, label, count, unavailable? }] }` for the read-only explorer registry
  (`utils/api/admin/tables.js`): `auth_users` (virtual, from the Auth admin API: id, email, dates,
  role, is_admin, approved, banned_until, providers), `profiles`, `student_notes`, `lessons`,
  `practice_sessions`, `review_attempts`, `lesson_plans`, `ai_generations`, `admin_audit_log`.
  `unavailable: 'missing'` (0006 not applied) or `'forbidden'` (not granted to `service_role`) with
  `count: null`, for the two optional tables.

**`GET /api/admin/tables/[table]`** — `pages/api/admin/tables/[table].js`
- Query `q` (the table's text columns; exact match on uuid columns when `q` is a uuid), `sort` (a
  registry column), `dir`, `page`, `perPage`.
- → `{ table, label, columns: [{ name, type: 'text'|'number'|'boolean'|'date'|'json'|'uuid' }], rows: object[],
  total, page, perPage }`. Only registry columns are read; text and JSON values are cut to 500
  characters (`transcript`, `canva`, `source_text` always).
- 404 `Table inconnue.`; 404 `missing_table`; 500 `forbidden_table`; 400 unknown sort column or
  direction.

**`GET /api/admin/audit`** — `pages/api/admin/audit.js`
- Query `action`, `entity`, `entityId` (case-insensitive for uuids), `page`, `perPage`.
- → `{ entries: [{ id, admin_email, action, entity, entity_id, details, created_at }], total, page, perPage }`,
  newest first.

---

## 7. Pages

### Shared and auth (English)

| Page | Notes |
|---|---|
| `/` | router (§2) |
| `/login`, `/auth/callback`, `/auth/confirm`, `/pending`, `/logout` | §2 |
| `/onboarding` | own look (`--ob-*` tokens, Inter). Steps: name → level → goals → interests → summary. Answers kept in sessionStorage per user, prefilled from `/api/me`; a failed `/api/me` shows « Try again » (never an empty flow). Completes with `POST /api/onboarding/complete`, then `refreshUser()` and `pathAfterSignIn`. Account deletion (`POST /api/student/deleteProfile`) behind a confirmation. |
| `pages/404.js` | any unknown path: "Page not found" with a link to `/` |
| `/dev/preview` | dev-only test bench of `LessonView` and `PracticePlayer` with the sample lesson: save error, "lesson updated", teacher preview, review mode, edge-case exercises, resume after reload; no auth, no API. 404 in production (`getServerSideProps`). |

### Student (English, `components/student/StudentShell.jsx`)

Tabs Home, Lessons, Review (badge = mistake count), Words, Profile: bottom tab bar on phones, top
navigation from 768 px. Every page runs `useMe()` (teachers → `/teacher`, pending → `/pending`, not
onboarded → `/onboarding`).

| Page | Notes |
|---|---|
| `/student` | home: "up next" card, mistakes card, recent lessons, progress card |
| `/student/lessons` | lessons with filters (`?filter=all`, `todo`, `work`, `mastered`), title search from 5 lessons, "Updated" badge, "Practiced … ago" |
| `/student/lessons/[id]` | recap (`LessonView`), « Save as PDF » (`window.print()`, printed header with the student's name), Drive link, practice button (`…/practice?from=lesson`), word flashcards of the lesson |
| `/student/lessons/[id]/practice` | full-screen `PracticePlayer`, no shell; exit waits up to 4 s for a pending save; `lesson_unavailable` replaces the player with a notice |
| `/student/review` | mistakes intro (total count, 20 per round), then the full-screen player; a round whose save failed after the player closed is kept with « Try again » / « Discard » |
| `/student/vocabulary` | word bank (search, per-lesson groups) and flashcards (`?mode=cards&lesson=<id>` deck), French text-to-speech when a French voice exists |
| `/student/profile` | edit name, level, goals, interests (unsaved-changes guard), sign out, delete account (confirmation dialog) |

### Teacher (French, `components/teacher/TeacherShell.jsx`)

Navigation « Élèves », « Nouvelle leçon », « Importer »; account menu « Déconnexion »
(`/logout?from=teacher`).

| Page | Notes |
|---|---|
| `/teacher` | dashboard: stats, « À traiter » (access requests with accept / refuse, failed or stuck generations, drafts, failed regenerations with « Ignorer »), « Élèves sans leçon récente », recent activity, student cards and search, invite dialog (`?invite=1`; link to copy, or email instead) |
| `/teacher/students/[id]` | student hero, lessons list (status pills: brouillon, bloquée, importée…), « Préparer le prochain cours » plans (`#plan`), profile form with « Notes privées » and « Contexte pour l'IA », account panel (`#compte`: status, « Copier un lien de connexion » with an English message to paste in the Preply chat) |
| `/teacher/lessons/new` | `?student=<id>`: transcript and Canva notes (« Coller » buttons, Ctrl/⌘+Enter), exercise options (« Laisser l'IA choisir » by default), « Relire avant de publier », per-student localStorage draft with its `clientKey`; POST then redirect to the lesson page (`?duplicate=1` for a duplicate) |
| `/teacher/lessons/[id]` | tabs (`?tab=recap`, `exercises`, `results`, `sources`); generation progress (light polling), publish / withdraw, « Tester les exercices » (player `preview` in a modal layer), exercise edit and removal (6 s undo), results of the current version, sources, « Modifier les sources et régénérer », failed-regeneration banner (« Réessayer », « Masquer » = `dismissError`), delete, « Copier le lien élève » |
| `/teacher/lessons/import` | batch import, below |

**Import page**: pick a student (`?student=`), add PDFs (sent to `extract`), `.txt` / `.md` files
(read in the browser) and Google links (`resolve`); at most 20 documents, one lesson each, with an
editable title and date. The date is detected from the file name, the Doc title or the first lines
(future dates refused, « Appliquer cette date à toutes les lignes »); the title is derived from the
file name (`Rebecca_L07_Vouloir-Vocab.pdf` → « Leçon 7 — Vouloir vocab »; generic names leave it to
the AI); a warning shows when the student already has a lesson on that date. Options are set once;
« Relire avant de publier » sends `publish: false`. The queue runs 2 documents at a time, oldest lesson
first: `POST /api/teacher/lessons/import` with each row's `clientKey`, then polling `?light=1` every
4 s; network and server errors are retried twice automatically; the queue pauses when the same error
happens twice in a row; « Réessayer les N échecs ». The queue is saved in sessionStorage (never the
text or the files) and restored after a reload; leaving is guarded while documents are not sent yet.

### Back office (French, `components/admin/AdminShell.jsx`)

Desktop-first, drawer menu on phones. Navigation « Tableau de bord », « Utilisateurs », « Leçons »,
« Tables », « Journal »; « Espace prof » (the main app's `/teacher`) and « Se déconnecter »
(`/logout?from=admin`). Every page requires `is_admin` (proxy); list state lives in the URL.

| Page | Notes |
|---|---|
| `/admin` | dashboard (`/api/admin/stats`): totals, 30-day charts, AI cost and failures, recent lessons and sign-ups |
| `/admin/users` | search, role / « En attente » filter, sortable columns, pagination; invite modal (link to copy, or email) |
| `/admin/users/[id]` | account (role change with confirmation, admin flag, suspension, approval, « Copier un lien de connexion », deletion with email confirmation), profile with notes and AI context, lessons, sessions, reviews, « Historique » (audit entries) |
| `/admin/lessons` | search (title, student name or email), status filter, removable student filter |
| `/admin/lessons/[id]` | editor tabs Métadonnées, Contenu, Exercices, Sources, Sessions, Historique; student preview; conflict dialog (« Recharger » / « Écraser » only the changed fields); read-only while a generation runs (visibility still switchable, refreshes every 5 s); a stuck generation needs a status; unsaved edits survive a reload of the lesson |
| `/admin/tables`, `/admin/tables/[table]` | read-only table explorer |
| `/admin/audit` | audit log filtered by action, entity, entity id |
| `/admin/forbidden` | public, for signed-in non-admins (§2) |

---

## 8. Practice player

`components/practice/PracticePlayer.jsx` — Duolingo-style runner (English UI), client-only (render it
after mount: it shuffles match columns and reads sessionStorage in state initializers).

```jsx
<PracticePlayer
  exercises={lesson.exercises}          // as returned by the API (MCQ order kept)
  title={lesson.title}                  // end-screen subtitle, accessible name
  onComplete={(answers, { runId }) => api(…)}  // → Promise<{ score, total, bestScore, bestTotal } | void>
  onRestart={() => …}                   // optional: "Restart" after 'lesson_updated'
  onExit={() => …}                      // close button, end-screen exit
  resumeKey={`lesson:${id}:${version}`} // optional: resume after a reload
  preview                               // optional (teacher): nothing saved
  labels={{ exit, restart, saved }}     // optional texts (review page)
/>
```

- `onComplete` is called **once per run**, as soon as every exercise has a first attempt (before the
  retry loop of wrong answers ends), with the **first** attempt at each exercise
  `[{ exerciseId, value }]`. The score is final then: leaving during the retry loop keeps it
  (« ✓ Score saved » tag).
- `runId` (`crypto.randomUUID`, with a fallback) is made per run and reused when a failed save is
  retried or a run is resumed, so the server can ignore duplicates.
- A rejected `onComplete` shows « Retry ». An `ApiError` with code `lesson_updated` shows « This lesson
  was just updated » with « Restart » (calls `onRestart`; without it only the exit button). « Practice
  again » after a failed save asks for confirmation.
- `resumeKey`: the run in progress (queue, first attempts, `runId`, save state, fingerprint of the
  exercises) is kept in sessionStorage under `preply:practice:<resumeKey>` and resumed after a reload
  (« Welcome back »). It is ignored if the exercises changed, cleared on exit and once the saved run's
  player goes away; a run left while its save is in flight or failed is kept, and saved again with the
  same `runId` on the next visit.
- Leaving while the score is not saved (unfinished run, failed save) asks first: close button and
  Escape (in-player dialog, focus on « Keep practicing »), in-app links, reload, browser back/forward
  (`useLeaveGuard` → `useUnsavedGuard`).
- `preview`: French banner « Aperçu — rien n'est enregistré », « Fermer l'aperçu » / « Recommencer »,
  `onComplete` never called, no leave guard.
- Exercise text (prompt, sentence, hint, explanation, match tiles) is rendered with `RichTextInline`;
  MCQ choices without highlight. French blocks carry `lang="fr"`, the player root `lang="en"`.
- Listen buttons (French text-to-speech, `components/student/vocabulary/useFrenchSpeech.js`, hidden
  without a French voice): MCQ sentence (the blank read as "…", completed after Check), full
  fill-in-the-blank sentence after Check, French match tiles. Sound effects: `utils/sound.js` +
  `SoundToggle` (setting shared across tabs).
- A Continue click within 400 ms of the feedback appearing (or the rest of a double click) is
  ignored, so a double click on Check never skips the feedback; keyboard activation is never ignored.
- Exercises may carry `lessonTitle` (review mode): shown as a « From: <title> » tag.

Callers:

| Caller | Props |
|---|---|
| `pages/student/lessons/[id]/practice.js` | `title`, `resumeKey = lesson:<id>:<version>`, `onRestart` (reloads the lesson), `onComplete` → `POST …/practice { answers, version, runId }`; handles `lesson_unavailable` itself |
| `pages/student/review.js` | review `labels`, `onComplete` → `POST /api/student/review` with each answer's `version`; no `resumeKey` |
| `pages/teacher/lessons/[id].js` | `preview` inside `components/teacher/lessons/PreviewLayer.jsx` (portal with `role="dialog"`, `aria-modal`, `#__next` inert), loaded on demand |
| `pages/dev/preview.js` | every state, simulated saves |

`components/lesson/LessonView.jsx` renders the recap: `<LessonView content title? lessonDate?
studentName? teacherName? />` (the optional props only feed the printed header, « Wael — cours de
français »); stable anchors `#recap-summary`, `#recap-vocabulary`, etc.

---

## 9. Design system

- **Tokens** in `styles/tokens.css` (`--st-*`), used everywhere except the onboarding flow. Hues
  `green`, `blue`, `orange`, `red`, `purple`, `yellow`, `pink`, each with the base colour and `-dark`,
  `-bg`, `-line` shades, a `-strong` fill with its `-strong-dark` edge (no yellow strong), and an
  `-ink` text colour. Neutrals `--st-ink`, `--st-ink-soft`, `--st-on-color`, `--st-line`,
  `--st-surface`, `--st-surface-glass`, `--st-bg`; interaction `--st-focus`, `--st-link`,
  `--st-link-hover`, `--st-disabled-*`; `--st-overlay`, shadows, skeleton, radii, `--st-tabbar-h`.
- **Contrast rules (WCAG AA)**:
  - bright hues (`--st-green`, `--st-blue`…) and their `-dark` / `-bg` / `-line` shades are
    decoration only (surfaces, borders, 3D edges, bars, illustrations): never text, never behind
    white text;
  - white text sits on a `-strong` fill with `var(--st-on-color)`: ≥ 4.5:1, including under the 4 %
    hover brightening of `ui.btn`;
  - coloured text uses `-ink` (≥ 4.5:1 on white, `--st-bg` and its own `-bg`);
  - focus rings use `--st-focus` (one global `:focus-visible` ring in `styles/globals.css` for controls
    without their own); links use `--st-link`;
  - teacher-area placeholders use `var(--st-placeholder, #6f6f6f)` (≥ 4.5:1; the token itself is not
    defined in `tokens.css`, so the fallback applies).
- **Primitives**: `components/ui/ui.module.css` (`btn` with `green`, `blue`, `orange`, `red`, `purple`,
  `pink`, `ghost`, `small`, `block`; `card`, `pill`, `sectionTitle`, `skel`, `theme`); one CSS module
  per component. `components/ui/accents.js` gives each lesson a stable accent colour
  (`--accent`, `--accent-dark`, `--accent-bg` for decoration, `--accent-ink` for text,
  `--accent-strong` behind white labels).
- **Dialogs**: every modal is built on `components/ui/Dialog.jsx` (native `<dialog>` with
  `showModal()`: inert page, top layer, Escape and backdrop close unless `busy`, focus kept inside and
  returned on close, `aria-modal`). Destructive confirmations use `role="alertdialog"` and focus
  « Annuler » / « Cancel » first. Built on it: `components/teacher/Modal.jsx` and `ConfirmDialog.jsx`,
  `components/admin/common/Modal.jsx` (and the admin `ConfirmDialog`), the student
  `DeleteAccountDialog`, the onboarding `ConfirmDialog`, the player's `ConfirmExit`.
- **Fonts** (self-hosted by `next/font`, no request to Google): Nunito (variable, latin) everywhere,
  from `components/ui/font.js` as `--font-app` in `pages/_app.js`; **Inter only on `/onboarding`**
  (`--font-sans`, loaded in `pages/onboarding.js`).
- **Onboarding** keeps its own minimal look on purpose (`--ob-*` tokens in
  `components/onboarding/OnboardingLayout.module.css`, same AA rules).
- **Chrome**: `components/ui/Shell.jsx` (skip link « Skip to content » / « Aller au contenu »,
  labels in the page language, bottom tab bar below 768 px, top navigation above; between 768 and
  899 px the brand shows the flag only) is used by `StudentShell` and `TeacherShell` (`lang="fr"`,
  menu-button account menu); the back office has `AdminShell`. The practice player is full-screen
  without a shell. `components/ui/LoadingScreen.jsx` announces "Loading…" / « Chargement… » after
  mount.
- **Unsaved changes**: `useUnsavedGuard(dirty, message?)` (`components/ui/useUnsavedGuard.js`) warns on
  reload / close, in-app navigation and browser back / forward; several guards on one page share one
  registry (`components/ui/unsavedGuards.js`) and ask once, with the latest guard's message. It returns
  a `bypass` ref for navigations the page triggers itself.
- **Print**: `styles/print.css` (global). A page containing `.lesson-view` prints only the recap (via
  `:has()`), with its own header and layout from `LessonView.module.css`; `.no-print` hides anything
  else.

---

## 10. Client state (caches, cookies, storage)

Nothing here is trusted by the server; storage access is wrapped in try/catch everywhere.

| Where | Key | Contents |
|---|---|---|
| cookies (Supabase) | `sb-<project-ref>-auth-token*` | session (chunks, PKCE verifier), set by `@supabase/ssr` |
| cookie (httpOnly, proxy) | `pl-onboarded` | user id whose onboarding is done, 30 days (§2) |
| cookie (browser) | `pl-link-confirm` | user id signed in by a link and not confirmed yet, 30 days (§2) |
| localStorage | `lessonDraft:<studentId>` or `lessonDraft:unassigned` | new-lesson draft `{ title, transcript, canva, lessonDate, clientKey, options: { count, types, instructions, auto? } or null, submittedAt, savedAt }` (`submittedAt` > 0: already sent once) |
| localStorage | `teacher.lastStudent` | last student picked in the new-lesson form |
| localStorage | `teacher.reviewBeforePublish` | `'1'` / `'0'`, « Relire avant de publier » (new lesson and import) |
| localStorage | `preply:sound` | `'on'` / `'off'`, sound effects, synced across tabs |
| sessionStorage | `preply:practice:<resumeKey>` | practice run to resume (§8) |
| sessionStorage | `teacher.import.queue` | import queue (version 1, 24 h max; no text, no files; ids validated on restore) |
| sessionStorage | `onboarding-draft:v1:<userId>` | onboarding answers and step |
| sessionStorage | `pl-signout-partial` | a global sign-out only worked on this device: `/login` says so once (2 min) |

- **Student cache** (`components/student/cache.js`, in memory): `useMe()` (key `me`, `/api/me`, fresh
  for 5 min; the profile page always refreshes) and `useLessons()` (key `lessons`,
  `/api/student/lessons`: shows the cached list and refreshes in the background; the shell's Review
  badge accepts 3 min). Pages show cached data at once; practice and review saves patch it; a response
  started before a local update never overwrites it. It belongs to the signed-in user and is dropped
  when the user changes; a "go to onboarding / pending / teacher" answer is never cached. After a
  sign-out started in this tab (`markSigningOut()`) the hooks stay idle; a sign-out elsewhere sends the
  page to `/login?next=…`.
- Teacher pages load with `useApiResource` / `usePolling` (`components/teacher/hooks.js`); back-office
  lists keep their filters in the URL (`useAdminQuery`, `useUrlQuery`).

---

## 11. Local development, database, tests

- **Local stack**: `pnpm db:start` (Supabase CLI + Docker/Colima; realtime, imgproxy, edge runtime,
  logflare, vector and supavisor are skipped) applies every migration. API <http://127.0.0.1:54321>,
  Studio <http://127.0.0.1:54323>, emails (magic links, invitations) at <http://127.0.0.1:54324>.
  `pnpm db:stop` stops it.
- **Env overrides**: put `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the local anon and
  service-role keys (`supabase status -o env`) and `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in
  `.env.development.local` (takes precedence over `.env.local` for `pnpm dev` only).
- **Owner account**: `node --env-file=.env.development.local scripts/bootstrap-owner.mjs <email>`
  (prints a one-time sign-in link when it creates the account). Without `AI_API_KEY` the AI runs in
  demo mode.
- **Hosts**: <http://localhost:3000>, back office at `/admin` or <http://backoffice.localhost:3000>,
  `/dev/preview` without sign-in. Local auth redirect URLs are in `supabase/config.toml`.
- **Production database** (from `webapp/`, project `ycxemjutfkfxxmmfqqgq` already linked):
  `pnpm db:status` compares local and remote migrations, `pnpm db:push` applies the missing ones
  (`supabase login` / `pnpm db:link` if the session expired). All of 0001–0006 are applied. A
  migration must reach production **before** the code that depends on it is merged into `main`.
- **New migration**: a new file `supabase/migrations/000N_<name>.sql` (keep the numbering;
  `pnpm db:new` would name it with a timestamp), idempotent, with the `grant … to service_role` of its
  new tables, tested with `pnpm db:start`.
- **Checks before every PR**: `pnpm test` and `pnpm build`.
- **Tests** (`tests/*.test.js`, Vitest, node environment, `@/` alias; no database, no AI key, no DOM):
  pure helpers (grading, schema, validation, routing, same-origin check, import parsing and
  detection, drafts, onboarding options, exercise editing, plan text, practice run state, unsaved-guard
  registry), the proxy (`NextRequest`), the sign-in landing, the AI client (mocked `fetch`), and API
  routes and helpers run against small in-memory Supabase stand-ins (`teacherRoutes`,
  `backend-fixes`, `student-fixes`, `admin`). React components are not tested automatically.
