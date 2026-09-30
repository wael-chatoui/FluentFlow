-- =====================================================================
-- Join links: one-time invitation links that need no email address.
-- The teacher creates a link (optional first name as a label) and pastes it in
-- the Preply chat; the student opens /join/<token>, signs in (Google or magic
-- link, account creation allowed) and the API approves the account.
-- Only the SHA-256 of the token is stored. Single use, expires, revocable.
-- Run after 0001–0006. Idempotent: safe to re-run.
-- =====================================================================

create table if not exists public.join_links (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,             -- hex SHA-256 of the token in the URL
  label       text,                             -- student's first name (optional)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz
);
create index if not exists join_links_created_idx on public.join_links (created_at desc);

-- The browser never reads it: only the API, with the service role
alter table public.join_links enable row level security;
revoke all on table public.join_links from anon, authenticated;
grant select, insert, update, delete on public.join_links to service_role;
