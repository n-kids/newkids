begin;

drop policy if exists "Admins can update config" on public.site_config;
create policy "Selected site admin can update config"
  on public.site_config for update to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

drop policy if exists "Admins can update categories" on public.program_categories;
create policy "Selected site admin can manage categories"
  on public.program_categories for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

drop policy if exists "관리자 폼 전체 권한" on public.custom_forms;
drop policy if exists "누구나 폼 조회 가능" on public.custom_forms;
create policy "Public can read active forms"
  on public.custom_forms for select to anon, authenticated using (is_active is true);
create policy "Selected site admin can manage forms"
  on public.custom_forms for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

drop policy if exists "관리자 응답 전체 권한" on public.form_responses;
drop policy if exists "누구나 응답 제출 가능" on public.form_responses;
create policy "Public can submit to active forms"
  on public.form_responses for insert to anon, authenticated
  with check (exists (
    select 1 from public.custom_forms f
    where f.id = form_id and f.is_active is true
  ));
create policy "Selected site admin can manage form responses"
  on public.form_responses for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

drop policy if exists "관리자만 답변 삭제 허용" on public.post_comments;
drop policy if exists "관리자만 답변 작성 허용" on public.post_comments;
create policy "Selected site admin can insert replies"
  on public.post_comments for insert to authenticated
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);
create policy "Selected site admin can delete replies"
  on public.post_comments for delete to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);
revoke select on table public.post_comments from public, anon, authenticated;
grant select (id, post_id, author, content, created_at)
  on table public.post_comments to anon, authenticated;

drop policy if exists "Enable delete for authenticated users only" on public.site_popups;
drop policy if exists "Enable insert for authenticated users only" on public.site_popups;
drop policy if exists "Enable update for authenticated users only" on public.site_popups;
create policy "Selected site admin can manage popups"
  on public.site_popups for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

revoke all on table public.admin_activity_logs from anon;
drop policy if exists "Selected site admin can manage activity logs" on public.admin_activity_logs;
create policy "Selected site admin can manage activity logs"
  on public.admin_activity_logs for all to authenticated
  using ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid)
  with check ((select auth.uid()) = 'f17f6f28-84d7-426e-9eb1-cdac8ec015d4'::uuid);

commit;