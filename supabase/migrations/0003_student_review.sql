-- =====================================================================
-- Student dashboard v2: mistake review + generation timestamp.
-- Run after 0001 in Supabase → SQL Editor. Idempotent.
-- =====================================================================

-- When the current content/exercises were generated. Practice results older
-- than this refer to a previous version of the exercises and are ignored
-- when computing which exercises a student still gets wrong.
alter table public.lessons add column if not exists generated_at timestamptz;
update public.lessons set generated_at = coalesce(generated_at, updated_at, created_at) where generated_at is null;
alter table public.lessons alter column generated_at set default now();

-- One row per exercise answered in a "Review mistakes" session
create table if not exists public.review_attempts (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users (id) on delete cascade,
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  exercise_id text not null,
  correct     boolean not null,
  value       jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists review_attempts_student_idx
  on public.review_attempts (student_id, created_at desc);

alter table public.review_attempts enable row level security;

drop policy if exists review_read on public.review_attempts;
create policy review_read on public.review_attempts
  for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
