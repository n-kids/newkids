begin;

-- Restore the prior policy model for post and page tables.
alter table public.total_posts disable row level security;
drop policy if exists "Public can read visible non-secret posts" on public.total_posts;
drop policy if exists "Site admin can manage posts" on public.total_posts;
alter table public.total_posts drop column if exists has_download_password;
grant select, insert, update, delete on table public.total_posts to anon, authenticated;
grant usage, select on sequence public.total_posts_id_seq to anon, authenticated;

alter table public.page_contents disable row level security;
drop policy if exists "Site admin can manage page contents" on public.page_contents;
grant select, insert, update, delete on table public.page_contents to anon, authenticated;

drop policy if exists "Selected site admin can update config" on public.site_config;
drop policy if exists "Admins can update config" on public.site_config;
create policy "Admins can update config" on public.site_config
  for update to authenticated using (true) with check (true);
grant select on table public.site_config to anon, authenticated;
grant update on table public.site_config to authenticated;

drop policy if exists "Selected site admin can manage categories" on public.program_categories;
drop policy if exists "Admins can update categories" on public.program_categories;
create policy "Admins can update categories" on public.program_categories
  for all to authenticated using (true) with check (true);
grant select on table public.program_categories to anon, authenticated;
grant insert, update, delete on table public.program_categories to authenticated;

drop policy if exists "Selected site admin can manage forms" on public.custom_forms;
drop policy if exists "Public can read active forms" on public.custom_forms;
drop policy if exists "관리자 폼 전체 권한" on public.custom_forms;
drop policy if exists "누구나 폼 조회 가능" on public.custom_forms;
create policy "관리자 폼 전체 권한" on public.custom_forms
  for all to authenticated using (true) with check (true);
create policy "누구나 폼 조회 가능" on public.custom_forms
  for select to anon, authenticated using (true);
grant select on table public.custom_forms to anon, authenticated;
grant insert, update, delete on table public.custom_forms to authenticated;

drop policy if exists "Selected site admin can manage form responses" on public.form_responses;
drop policy if exists "Public can submit to active forms" on public.form_responses;
drop policy if exists "관리자 응답 전체 권한" on public.form_responses;
drop policy if exists "누구나 응답 제출 가능" on public.form_responses;
create policy "관리자 응답 전체 권한" on public.form_responses
  for all to authenticated using (true) with check (true);
create policy "누구나 응답 제출 가능" on public.form_responses
  for insert to anon, authenticated with check (true);
grant select, insert, update, delete on table public.form_responses to authenticated;
grant insert on table public.form_responses to anon;

drop policy if exists "Selected site admin can insert replies" on public.post_comments;
drop policy if exists "Selected site admin can delete replies" on public.post_comments;
drop policy if exists "관리자만 답변 작성 허용" on public.post_comments;
drop policy if exists "관리자만 답변 삭제 허용" on public.post_comments;
create policy "관리자만 답변 작성 허용" on public.post_comments
  for insert to authenticated with check (true);
create policy "관리자만 답변 삭제 허용" on public.post_comments
  for delete to authenticated using (true);
grant select on table public.post_comments to anon, authenticated;
grant insert, update, delete on table public.post_comments to authenticated;

drop policy if exists "Selected site admin can manage popups" on public.site_popups;
drop policy if exists "Enable delete for authenticated users only" on public.site_popups;
drop policy if exists "Enable insert for authenticated users only" on public.site_popups;
drop policy if exists "Enable update for authenticated users only" on public.site_popups;
create policy "Enable delete for authenticated users only" on public.site_popups
  for delete to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.site_popups
  for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.site_popups
  for update to authenticated using (true) with check (true);
grant select on table public.site_popups to anon, authenticated;
grant insert, update, delete on table public.site_popups to authenticated;

-- Restore the previous ACL and broad authenticated access pattern for logs.
drop policy if exists "Selected site admin can manage activity logs" on public.admin_activity_logs;
grant select, insert, update, delete on table public.admin_activity_logs to anon, authenticated;

-- Restore the previous public image update/delete policies.
drop policy if exists "Site admin can update images" on storage.objects;
drop policy if exists "Site admin can delete images" on storage.objects;
drop policy if exists "Allow All 1ffg0oo_2" on storage.objects;
drop policy if exists "Allow All 1ffg0oo_3" on storage.objects;
create policy "Allow All 1ffg0oo_2" on storage.objects
  for update to anon, authenticated using (bucket_id = 'images')
  with check (bucket_id = 'images');
create policy "Allow All 1ffg0oo_3" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'images');

commit;
