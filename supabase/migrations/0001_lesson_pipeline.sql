-- =====================================================================
-- Preply Lessons — lesson pipeline schema
-- Run once in Supabase → SQL Editor. Idempotent: safe to re-run.
--
-- Security model
--   * The role lives in auth.users.raw_app_meta_data->>'role' ('student' | 'teacher').
--     app_metadata can only be changed server-side, unlike user_metadata which
--     any logged-in user can edit about themselves.
--   * All writes go through the Next.js API (service role key) after an explicit
--     authorization check. Clients get read-only RLS policies as defence in depth.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'teacher'
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles: one row per user, filled at onboarding / by the teacher
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,
  full_name        text,
  level            text,          -- 'A1'..'C2' or 'unknown'
  goals            text,
  interests        text,
  drive_folder_url text,          -- set by the teacher
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Teacher-only private notes (kept out of profiles so students can never read them)
create table if not exists public.student_notes (
  student_id uuid primary key references auth.users (id) on delete cascade,
  notes      text,
  updated_at timestamptz not null default now()
);

drop trigger if exists student_notes_touch on public.student_notes;
create trigger student_notes_touch before update on public.student_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- lessons: one row per class, generated from transcript + Canva notes
-- (create-if-missing, then add columns, so an older `lessons` table is upgraded)
-- ---------------------------------------------------------------------
create table if not exists public.lessons (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.lessons add column if not exists title       text;
alter table public.lessons add column if not exists lesson_date date not null default current_date;
alter table public.lessons add column if not exists transcript  text;
alter table public.lessons add column if not exists canva       text;
alter table public.lessons add column if not exists status      text not null default 'generating';
alter table public.lessons add column if not exists error       text;
alter table public.lessons add column if not exists content     jsonb;
alter table public.lessons add column if not exists exercises   jsonb not null default '[]'::jsonb;
alter table public.lessons add column if not exists drive_url   text;
alter table public.lessons add column if not exists ai_model    text;
alter table public.lessons add column if not exists updated_at  timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lessons_status_check') then
    alter table public.lessons
      add constraint lessons_status_check check (status in ('generating', 'published', 'failed'));
  end if;
end $$;

create index if not exists lessons_student_date_idx
  on public.lessons (student_id, lesson_date desc, created_at desc);

drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- practice_sessions: one row per completed practice run of a lesson
-- ---------------------------------------------------------------------
create table if not exists public.practice_sessions (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  student_id   uuid not null references auth.users (id) on delete cascade,
  score        int  not null check (score >= 0),
  total        int  not null check (total > 0),
  answers      jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists practice_sessions_lesson_student_idx
  on public.practice_sessions (lesson_id, student_id, completed_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security: read-only for clients, no client writes at all
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.student_notes     enable row level security;
alter table public.lessons           enable row level security;
alter table public.practice_sessions enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_teacher());

drop policy if exists student_notes_read on public.student_notes;
create policy student_notes_read on public.student_notes
  for select to authenticated
  using (public.is_teacher());

drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons
  for select to authenticated
  using (public.is_teacher() or (student_id = auth.uid() and status = 'published'));

drop policy if exists practice_read on public.practice_sessions;
create policy practice_read on public.practice_sessions
  for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());

-- Drop any permissive policies an earlier setup may have left on `lessons`
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'lessons' and policyname <> 'lessons_read'
  loop
    execute format('drop policy %I on public.lessons', p.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- New users: default role 'student' + profile row
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'role', '') not in ('student', 'teacher') then
    new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role":"student"}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_role on auth.users;
create trigger on_auth_user_role before insert on auth.users
  for each row execute function public.handle_new_user_role();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- ---------------------------------------------------------------------
-- Backfill existing users
-- ---------------------------------------------------------------------
-- Everyone without a trusted role becomes a student. The teacher account is
-- promoted explicitly in 0002_set_teacher.sql — we deliberately do NOT trust
-- user_metadata.role, since users could have edited it themselves.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"student"}'::jsonb
where coalesce(raw_app_meta_data ->> 'role', '') not in ('student', 'teacher');

insert into public.profiles (id, email, full_name, onboarded_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  case when (u.raw_user_meta_data ->> 'onboarding_completed') = 'true' then now() end
from auth.users u
on conflict (id) do nothing;

-- Lesson files are no longer served from Supabase Storage (Drive links instead).
-- If the old public bucket exists, make it private so existing PDFs stop leaking.
update storage.buckets set public = false where id = 'lesson-pdfs';
