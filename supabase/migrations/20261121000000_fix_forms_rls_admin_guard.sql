create or replace function public.is_nk_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'wjsrlfdnd@gmail.com',
      'hkdongsim@naver.com',
      'newkids331@gmail.com'
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'custom_forms'
  ) then
    drop policy if exists "Authenticated admins can update custom_forms" on public.custom_forms;
    create policy "Authenticated admins can update custom_forms"
      on public.custom_forms for update to authenticated
      using (public.is_nk_admin())
      with check (public.is_nk_admin());

    drop policy if exists "Authenticated admins can delete custom_forms" on public.custom_forms;
    create policy "Authenticated admins can delete custom_forms"
      on public.custom_forms for delete to authenticated
      using (public.is_nk_admin());
  end if;

  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'form_responses'
  ) then
    drop policy if exists "Authenticated admins can delete form_responses" on public.form_responses;
    create policy "Authenticated admins can delete form_responses"
      on public.form_responses for delete to authenticated
      using (public.is_nk_admin());
  end if;
end $$;
