-- 폼/투표 공개 집계(개인정보 제외) RPC 및 관리자 개별 응답 삭제·수정 RLS 보강
-- Supabase SQL Editor에서 여러 번 실행해도 안전합니다.

create or replace function public.get_form_public_stats(p_form_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema jsonb;
  v_show_results boolean := false;
  v_questions jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_tallies jsonb := '{}'::jsonb;
  v_q jsonb;
  v_qid text;
  v_qtype text;
  v_q_counts jsonb;
begin
  select form_schema
    into v_schema
    from public.custom_forms
   where id::text = p_form_id
   limit 1;

  if not found then
    return jsonb_build_object('count', 0, 'tallies', '{}'::jsonb);
  end if;

  select count(*)::integer
    into v_count
    from public.form_responses
   where form_id::text = p_form_id;

  if jsonb_typeof(v_schema) = 'object' then
    v_show_results := coalesce((v_schema -> 'settings' ->> 'show_results_after_submit')::boolean, false);
    if jsonb_typeof(v_schema -> 'questions') = 'array' then
      v_questions := v_schema -> 'questions';
    end if;
  elsif jsonb_typeof(v_schema) = 'array' then
    v_questions := v_schema;
  end if;

  if v_show_results then
    for v_q in select value from jsonb_array_elements(v_questions)
    loop
      v_qid := v_q ->> 'id';
      v_qtype := v_q ->> 'type';
      if v_qid is not null and v_qtype in ('radio', 'checkbox') then
        with raw_vals as (
          select expanded.val
          from public.form_responses r
          cross join lateral (
            select jsonb_array_elements_text(
              case
                when jsonb_typeof(r.answers -> v_qid) = 'array' then r.answers -> v_qid
                when jsonb_typeof(r.answers -> v_qid) = 'string' then jsonb_build_array(r.answers -> v_qid)
                else '[]'::jsonb
              end
            ) as val
          ) expanded
          where r.form_id::text = p_form_id
            and r.answers ? v_qid
        ),
        normalized as (
          select
            case
              when val like '기타:%' then '기타(직접 입력)'
              else val
            end as label
          from raw_vals
          where val is not null and btrim(val) <> ''
        ),
        grouped as (
          select label, count(*)::integer as cnt
          from normalized
          group by label
        )
        select coalesce(jsonb_object_agg(label, cnt), '{}'::jsonb)
          into v_q_counts
          from grouped;

        v_tallies := jsonb_set(v_tallies, array[v_qid], v_q_counts, true);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'count', v_count,
    'tallies', v_tallies
  );
end;
$$;

revoke all on function public.get_form_public_stats(text) from public;
grant execute on function public.get_form_public_stats(text) to anon, authenticated;

-- 관리자(authenticated)가 폼 수정 및 개별 응답 삭제를 수행할 수 있도록 권한·정책 보강
grant update, delete on public.custom_forms to authenticated;
grant delete on public.form_responses to authenticated;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'custom_forms'
  ) then
    drop policy if exists "Authenticated admins can update custom_forms" on public.custom_forms;
    create policy "Authenticated admins can update custom_forms"
      on public.custom_forms for update to authenticated using (true) with check (true);
    drop policy if exists "Authenticated admins can delete custom_forms" on public.custom_forms;
    create policy "Authenticated admins can delete custom_forms"
      on public.custom_forms for delete to authenticated using (true);
  end if;

  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'form_responses'
  ) then
    drop policy if exists "Authenticated admins can delete form_responses" on public.form_responses;
    create policy "Authenticated admins can delete form_responses"
      on public.form_responses for delete to authenticated using (true);
  end if;
end $$;
