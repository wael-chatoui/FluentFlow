-- =====================================================================
-- Lesson import: lessons created from an existing document (PDF or Google
-- Drive/Docs link) instead of a class transcript. Run after 0001–0003. Idempotent.
-- =====================================================================

alter table public.lessons add column if not exists source_kind        text not null default 'transcript';
alter table public.lessons add column if not exists source_name        text;   -- file name or document title
alter table public.lessons add column if not exists source_text        text;   -- extracted document text
alter table public.lessons add column if not exists generation_options jsonb;  -- { count, types, instructions }

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lessons_source_kind_check') then
    alter table public.lessons
      add constraint lessons_source_kind_check check (source_kind in ('transcript', 'import'));
  end if;
end $$;
