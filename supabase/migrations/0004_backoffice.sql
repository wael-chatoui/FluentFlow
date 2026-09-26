-- =====================================================================
-- Back office: admin flag, audit log, AI usage tracking.
-- Run after 0001–0003 in Supabase → SQL Editor. Idempotent.
-- =====================================================================

-- Token usage reported by the AI provider for the current generation
-- ({ prompt_tokens, completion_tokens, total_tokens }), used for cost stats.
alter table public.lessons add column if not exists ai_usage jsonb;

-- Every write made from the back office is recorded here.
create table if not exists public.admin_audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references auth.users (id) on delete set null,
  admin_email text,
  action     text not null,            -- e.g. 'user.update', 'lesson.delete'
  entity     text not null,            -- 'user' | 'lesson' | …
  entity_id  text,
  details    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

-- No client access at all: only the service role (back office API) reads/writes it.
alter table public.admin_audit_log enable row level security;

-- ---------------------------------------------------------------------
-- Make YOUR account an admin (keeps its 'teacher' role). Replace the email,
-- run, then log out and back in. is_admin lives in app_metadata, which users
-- cannot edit themselves.
-- ---------------------------------------------------------------------
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
where email = 'REPLACE_WITH_YOUR_EMAIL@example.com';

select email, raw_app_meta_data ->> 'role' as role, raw_app_meta_data ->> 'is_admin' as is_admin
from auth.users
where (raw_app_meta_data ->> 'is_admin')::boolean is true;
