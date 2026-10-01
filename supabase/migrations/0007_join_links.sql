-- =====================================================================
-- Join links: one-time invitation links that need no email address.
-- The teacher gives the student's first name; the API creates a placeholder
-- student account right away (approved, app_metadata.placeholder = true, fake
-- address on the reserved .invalid domain, never able to sign in) so lessons,
-- exercises, notes and the AI context can be prepared before the student joins.
-- The teacher pastes the link in the Preply chat; the student opens
-- /join/<token>, signs in (Google or magic link, account creation allowed) and
-- the API claims the link: claim_join_link() moves everything the placeholder
-- owns to the real account in one transaction, then the API approves the real
-- account and deletes the placeholder.
-- Only the SHA-256 of the token is stored. Single use, expires, revocable.
-- Run after 0001–0006. Idempotent: safe to re-run.
-- =====================================================================

create table if not exists public.join_links (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,             -- hex SHA-256 of the token in the URL
  label       text,                             -- student's first name
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz
);
-- Placeholder student account created with the link (null for links created before it)
alter table public.join_links
  add column if not exists student_id uuid references auth.users (id) on delete set null;

create index if not exists join_links_created_idx on public.join_links (created_at desc);
create index if not exists join_links_student_idx on public.join_links (student_id) where student_id is not null;

-- The browser never reads it: only the API, with the service role
alter table public.join_links enable row level security;
revoke all on table public.join_links from anon, authenticated;
grant select, insert, update, delete on public.join_links to service_role;

-- ---------------------------------------------------------------------
-- claim_join_link(token_hash, user): spends the link for `user` and moves what
-- the link's placeholder owns (lessons, plans, practice, review attempts, AI
-- usage, teacher notes, empty profile fields) to `user`, in one transaction.
-- Returns { ok: true, already_claimed, link_id, label, placeholder_id, lessons }
--      or { ok: false, reason: 'unknown'|'used'|'revoked'|'expired'|'not_student' }.
-- Idempotent for the user who already claimed the link (moves anything left).
-- The API then approves `user` and deletes the placeholder auth user.
-- ---------------------------------------------------------------------
create or replace function public.claim_join_link(p_token_hash text, p_user uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_link   public.join_links%rowtype;
  v_meta   jsonb;
  v_ph     uuid;
  v_again  boolean;
  v_count  integer := 0;
begin
  -- One claim at a time per link: a second browser waits here, then sees it used
  select * into v_link from public.join_links where token_hash = p_token_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;

  select raw_app_meta_data into v_meta from auth.users where id = p_user;
  if not found then
    raise exception 'claim_join_link: unknown user %', p_user;
  end if;
  -- Never a teacher, an admin or another placeholder
  if coalesce(v_meta ->> 'role', '') = 'teacher'
     or coalesce(v_meta ->> 'is_admin', '') = 'true'
     or coalesce(v_meta ->> 'placeholder', '') = 'true' then
    return jsonb_build_object('ok', false, 'reason', 'not_student');
  end if;

  v_again := v_link.used_by is not null and v_link.used_by = p_user;
  if not v_again then
    if v_link.used_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'used');
    elsif v_link.revoked_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'revoked');
    elsif v_link.expires_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'expired');
    end if;
  end if;

  -- Only an actual placeholder is emptied (and later deleted by the API)
  select u.id into v_ph
  from auth.users u
  where u.id = v_link.student_id
    and u.id <> p_user
    and coalesce(u.raw_app_meta_data ->> 'placeholder', '') = 'true';

  if v_ph is not null then
    -- Client keys are unique per student: drop the rare one the real account already uses
    update public.lessons l
       set student_id = p_user,
           client_key = case
             when l.client_key is not null and exists (
               select 1 from public.lessons o where o.student_id = p_user and o.client_key = l.client_key
             ) then null
             else l.client_key
           end
     where l.student_id = v_ph;
    get diagnostics v_count = row_count;

    update public.practice_sessions s
       set student_id = p_user,
           client_run_id = case
             when s.client_run_id is not null and exists (
               select 1 from public.practice_sessions o where o.student_id = p_user and o.client_run_id = s.client_run_id
             ) then null
             else s.client_run_id
           end
     where s.student_id = v_ph;

    update public.lesson_plans set student_id = p_user where student_id = v_ph;
    update public.review_attempts set student_id = p_user where student_id = v_ph;
    update public.ai_generations set student_id = p_user where student_id = v_ph;

    -- Teacher notes: move the row, or merge both texts when the account already has one
    if exists (select 1 from public.student_notes where student_id = p_user) then
      update public.student_notes r
         set notes = case
               when coalesce(p.notes, '') = '' or p.notes = r.notes then r.notes
               when coalesce(r.notes, '') = '' then p.notes
               else r.notes || E'\n\n' || p.notes
             end,
             ai_context = case
               when coalesce(p.ai_context, '') = '' or p.ai_context = r.ai_context then r.ai_context
               when coalesce(r.ai_context, '') = '' then p.ai_context
               else r.ai_context || E'\n\n' || p.ai_context
             end
        from public.student_notes p
       where r.student_id = p_user and p.student_id = v_ph;
      delete from public.student_notes where student_id = v_ph;
    else
      update public.student_notes set student_id = p_user where student_id = v_ph;
    end if;

    -- Profile: what the teacher filled in, only where the real account has nothing
    insert into public.profiles (id, email)
    select p_user, u.email from auth.users u where u.id = p_user
    on conflict (id) do nothing;
    update public.profiles r
       set full_name        = coalesce(nullif(btrim(r.full_name), ''), p.full_name),
           level            = coalesce(r.level, p.level),
           goals            = coalesce(nullif(btrim(r.goals), ''), p.goals),
           interests        = coalesce(nullif(btrim(r.interests), ''), p.interests),
           drive_folder_url = coalesce(nullif(btrim(r.drive_folder_url), ''), p.drive_folder_url)
      from public.profiles p
     where r.id = p_user and p.id = v_ph;

    -- Other links still waiting for this placeholder can no longer give it away
    update public.join_links
       set revoked_at = now()
     where student_id = v_ph and id <> v_link.id and used_at is null and revoked_at is null;
  end if;

  if not v_again then
    update public.join_links set used_at = now(), used_by = p_user where id = v_link.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_claimed', v_again,
    'link_id', v_link.id,
    'label', v_link.label,
    'placeholder_id', v_ph,
    'lessons', v_count
  );
end;
$$;

-- Only the API (service role) may call it
revoke all on function public.claim_join_link(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_join_link(text, uuid) to service_role;
