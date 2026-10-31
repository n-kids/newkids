-- Roll back the first post-password access restriction attempt.
-- The following full rollback migration restores the earlier policy model for all affected tables.
alter table public.total_posts disable row level security;
drop policy if exists "Public can read visible non-secret posts" on public.total_posts;
drop policy if exists "Site admin can manage posts" on public.total_posts;
grant select, insert, update, delete on table public.total_posts to anon, authenticated;
grant usage, select on sequence public.total_posts_id_seq to anon, authenticated;
