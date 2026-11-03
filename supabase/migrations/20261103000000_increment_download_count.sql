-- 다운로드 횟수를 원자적으로 1 증가시키는 함수 (view.html에서 호출)
create or replace function public.increment_download_count(p_post_id bigint)
returns integer language sql security definer set search_path = public as $$
  update public.total_posts set download_count = coalesce(download_count,0) + 1 where id = p_post_id returning download_count;
$$;
revoke all on function public.increment_download_count(bigint) from public;
grant execute on function public.increment_download_count(bigint) to anon, authenticated;
