-- =====================================================================
-- Publishing control, invite-only access, AI context, tutor plans, AI ledger,
-- idempotent writes and client lock-down. Run after 0001–0005 in
-- Supabase → SQL Editor. Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lessons: teacher-controlled visibility + idempotent creation
-- ---------------------------------------------------------------------
-- hidden = true: the student does not see the lesson (draft to review, or
-- withdrawn by the teacher). Independent of the generation status.
alter table public.lessons add column if not exists hidden boolean not null default false;

-- Random key sent by the teacher's browser with "create" / "import" requests, so
-- a retried request returns the lesson already created instead of a duplicate.
alter table public.lessons add column if not exists client_key uuid;
create unique index if not exists lessons_student_client_key_idx
  on public.lessons (student_id, client_key) where client_key is not null;

-- ---------------------------------------------------------------------
-- Teacher notes: private notes stay private; ai_context is what the AI sees
-- ---------------------------------------------------------------------
alter table public.student_notes add column if not exists ai_context text;

-- ---------------------------------------------------------------------
-- Practice: idempotent saves (one row per client run)
-- ---------------------------------------------------------------------
alter table public.practice_sessions add column if not exists client_run_id uuid;
create unique index if not exists practice_sessions_student_run_idx
  on public.practice_sessions (student_id, client_run_id) where client_run_id is not null;

create index if not exists practice_sessions_student_idx
  on public.practice_sessions (student_id, completed_at desc);
create index if not exists review_attempts_lesson_idx
  on public.review_attempts (lesson_id);

-- ---------------------------------------------------------------------
-- Tutor lesson plans ("Préparer le prochain cours"), teacher-only
-- ---------------------------------------------------------------------
create table if not exists public.lesson_plans (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  focus      text,
  content    jsonb not null,
  ai_model   text,
  created_at timestamptz not null default now()
);
create index if not exists lesson_plans_student_idx on public.lesson_plans (student_id, created_at desc);
alter table public.lesson_plans enable row level security;

-- ---------------------------------------------------------------------
-- AI ledger: one row per generation attempt (success or failure), for real
-- cost, failure rate and latency in the back office.
-- ---------------------------------------------------------------------
create table if not exists public.ai_generations (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null,               -- 'lesson' | 'plan'
  lesson_id         uuid references public.lessons (id) on delete set null,
  student_id        uuid references auth.users (id) on delete set null,
  model             text,
  ok                boolean not null,
  error             text,
  prompt_tokens     int,
  completion_tokens int,
  duration_ms       int,
  created_at        timestamptz not null default now()
);
-- Real cost in USD as reported by the provider (OpenRouter usage.cost), summed over
-- the attempt's calls. Null when unknown: the back office then estimates it from
-- the tokens. Separate statement so a database that already ran 0006 gets it too.
alter table public.ai_generations add column if not exists cost_usd numeric;
create index if not exists ai_generations_created_idx on public.ai_generations (created_at desc);
alter table public.ai_generations enable row level security;

-- ---------------------------------------------------------------------
-- Invite-only access: accounts created by self sign-up (e.g. "Continue with
-- Google" with an unknown address) start as pending until the teacher approves
-- them. Invited accounts are approved by the API right after creation.
-- Existing accounts have no flag and stay approved (missing = approved).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb);
  if coalesce(new.raw_app_meta_data ->> 'role', '') not in ('student', 'teacher') then
    new.raw_app_meta_data = new.raw_app_meta_data || '{"role":"student"}'::jsonb;
  end if;
  if not (new.raw_app_meta_data ? 'approved') then
    new.raw_app_meta_data = new.raw_app_meta_data || '{"approved":false}'::jsonb;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Client lock-down: the browser never reads tables (every read goes through
-- the Next.js API with the service role after an explicit check), so clients
-- get no direct access at all. This also stops students from reading the raw
-- transcript, Canva notes and imported text of their lessons through PostgREST.
-- ---------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
drop policy if exists student_notes_read on public.student_notes;
drop policy if exists lessons_read on public.lessons;
drop policy if exists practice_read on public.practice_sessions;
drop policy if exists review_read on public.review_attempts;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'student_notes', 'lessons', 'practice_sessions', 'review_attempts',
    'admin_audit_log', 'lesson_plans', 'ai_generations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- The API (service role) needs explicit grants: new Supabase projects no longer
-- expose tables to the Data API roles automatically (tables created by 0006,
-- or every table on a fresh database).
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
