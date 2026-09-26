-- =====================================================================
-- Promote YOUR account to teacher. Run after 0001, once you have logged in
-- at least once. Replace the email with the one you log in with.
-- Then log out and back in so your session picks up the new role.
-- =====================================================================

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"teacher"}'::jsonb
where email = 'REPLACE_WITH_YOUR_EMAIL@example.com';

-- Teachers don't need a student profile in the student list
update public.profiles set onboarded_at = coalesce(onboarded_at, now())
where id in (select id from auth.users where raw_app_meta_data ->> 'role' = 'teacher');

-- Check: should return exactly your account
select id, email, raw_app_meta_data ->> 'role' as role
from auth.users
where raw_app_meta_data ->> 'role' = 'teacher';
