-- Applied on 2026-11-01. Canonical migration: supabase/migrations/20261031222532_enable_secure_post_and_page_rls.sql
-- The policy is restricted to the selected Auth UID.
-- Public non-member post create/update/delete must go through the public-post-actions Edge Function.

begin;

-- `total_posts` contains plaintext post and download passwords. Keep those columns
-- out of browser SELECTs; frontend reads must name the permitted columns explicitly.
alter table public.total_posts
  add column if not exists has_download_password boolean
  generated always as (coalesce(nullif(download_password, '') is not null, false)) stored;

alter table public.total_posts enable row level security;
drop policy if exists "Enable delete for authenticated users only" on public.total_posts;
drop policy if exists "Enable insert for authenticated users only" on public.total_posts;
drop policy if exists "Enable read access for all users" on public.total_posts;
drop policy if exists "Enable update for authenticated users only" on public.total_posts;
drop policy if exists "Public can read visible non-secret posts" on public.total_posts;
drop policy if exists "Site admin can manage posts" on public.total_posts;
create policy "Public can read visible non-secret posts"
  on public.total_posts for select to anon, authenticated
  using (coalesce(is_visible, true) and not coalesce(is_secret, false)
    and coalesce(publish_at, now()) <= now());
create policy "Site admin can manage posts"
  on public.total_posts for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

revoke all on table public.total_posts from public, anon, authenticated;
grant select (id, created_at, title, content, image_url, category, thumbnail_url,
  link_url, order_num, video_url, is_visible, is_secret, download_count,
  is_notice, publish_at, has_download_password)
  on table public.total_posts to anon, authenticated;
grant insert (title, content, image_url, category, thumbnail_url, link_url,
  order_num, video_url, is_visible, is_secret, password, download_count,
  download_password, is_notice, publish_at)
  on table public.total_posts to authenticated;
grant update (title, content, image_url, category, thumbnail_url, link_url,
  order_num, video_url, is_visible, is_secret, password, download_count,
  download_password, is_notice, publish_at)
  on table public.total_posts to authenticated;
grant delete on table public.total_posts to authenticated;
grant usage, select on sequence public.total_posts_id_seq to authenticated;

-- Unused and empty page_contents is only accessible to the selected administrator.
alter table public.page_contents enable row level security;
drop policy if exists "Site admin can manage page contents" on public.page_contents;
create policy "Site admin can manage page contents"
  on public.page_contents for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);
revoke all on table public.page_contents from public, anon, authenticated;
grant select, insert, update, delete on table public.page_contents to authenticated;

-- Public site configuration remains readable; only the selected Auth UID can edit it.
drop policy if exists "Admins can update config" on public.site_config;
drop policy if exists "Selected site admin can update config" on public.site_config;
create policy "Selected site admin can update config"
  on public.site_config for update to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);
revoke select on table public.site_config from public, anon, authenticated;
grant select (id, updated_at, company_name, ceo_name, address, phone,
  primary_color, accent_color, main_hero_image, main_hero_title, main_hero_desc,
  main_hero_title_color, main_hero_desc_color, main_hero_bg_color,
  main_hero_overlay_color, main_hero_overlay_opacity, popup_image, popup_link,
  is_popup_visible)
  on table public.site_config to anon, authenticated;

-- Categories remain public-readable; only the selected Auth UID can change them.
drop policy if exists "Admins can update categories" on public.program_categories;
drop policy if exists "Selected site admin can manage categories" on public.program_categories;
create policy "Selected site admin can manage categories"
  on public.program_categories for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

-- Form definitions are public only while active; writes are administrator-only.
drop policy if exists "관리자 폼 전체 권한" on public.custom_forms;
drop policy if exists "누구나 폼 조회 가능" on public.custom_forms;
drop policy if exists "Public can read active forms" on public.custom_forms;
drop policy if exists "Selected site admin can manage forms" on public.custom_forms;
create policy "Public can read active forms"
  on public.custom_forms for select to anon, authenticated using (is_active is true);
create policy "Selected site admin can manage forms"
  on public.custom_forms for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

-- Form responses can be submitted for an active form; only the selected admin can read/manage them.
drop policy if exists "관리자 응답 전체 권한" on public.form_responses;
drop policy if exists "누구나 응답 제출 가능" on public.form_responses;
drop policy if exists "Public can submit to active forms" on public.form_responses;
drop policy if exists "Selected site admin can manage form responses" on public.form_responses;
create policy "Public can submit to active forms"
  on public.form_responses for insert to anon, authenticated
  with check (exists (select 1 from public.custom_forms f
    where f.id = form_id and f.is_active is true));
create policy "Selected site admin can manage form responses"
  on public.form_responses for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

-- Public replies stay readable, but writes and deletes are limited to the selected admin.
drop policy if exists "관리자만 답변 삭제 허용" on public.post_comments;
drop policy if exists "관리자만 답변 작성 허용" on public.post_comments;
drop policy if exists "Selected site admin can insert replies" on public.post_comments;
drop policy if exists "Selected site admin can delete replies" on public.post_comments;
create policy "Selected site admin can insert replies"
  on public.post_comments for insert to authenticated
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);
create policy "Selected site admin can delete replies"
  on public.post_comments for delete to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);
revoke select on table public.post_comments from public, anon, authenticated;
grant select (id, post_id, author, content, created_at)
  on table public.post_comments to anon, authenticated;

-- Popups stay public-readable; only the selected admin can manage them.
drop policy if exists "Enable delete for authenticated users only" on public.site_popups;
drop policy if exists "Enable insert for authenticated users only" on public.site_popups;
drop policy if exists "Enable update for authenticated users only" on public.site_popups;
drop policy if exists "Selected site admin can manage popups" on public.site_popups;
create policy "Selected site admin can manage popups"
  on public.site_popups for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

-- Activity logs are private to the selected administrator.
drop policy if exists "Selected site admin can manage activity logs" on public.admin_activity_logs;
create policy "Selected site admin can manage activity logs"
  on public.admin_activity_logs for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

commit;

