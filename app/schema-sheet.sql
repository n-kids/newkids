-- 뉴키즈 주문앱: 납품시트 자동 반영용 추가 설정 (schema.sql 다음에 실행. 여러 번 실행해도 안전)
-- 메인 컴퓨터의 반영 도구(sync-sheet.ps1)가 아래 두 함수만 부릅니다. 도구는 메인 컴퓨터에만 있는 열쇠(key)로 본인 확인을 합니다.
-- 열쇠 등록: 맨 아래 줄의 '<열쇠>' 자리에 메인 컴퓨터 열쇠 파일 내용을 넣고 실행 (반영 도구 설치 때 한 번)

alter table public.nk_orders  add column if not exists sheet_synced_at timestamptz;   -- 납품시트에 넣은 때
alter table public.nk_orders  add column if not exists sheet_note text;               -- 넣으면서 남긴 확인할 점
alter table public.nk_members add column if not exists sheet_name text;               -- 납품시트 D열 원 이름 (앱 원 이름과 다를 때)

create table if not exists public.nk_settings (k text primary key, v text not null);
alter table public.nk_settings enable row level security;   -- 정책 없음: 함수로만 읽음

create or replace function public.nk_sheet_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.nk_settings where k = 'sheet_key_hash' and v = crypt(p_key, v));
$$;

-- 시트에 아직 안 넣은, 확인된 교재 주문
create or replace function public.nk_sheet_pending(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'month', o.month, 'lines', o.lines, 'created_at', o.created_at, 'sheet_note', o.sheet_note,
                                        'kg', m.kg, 'sheet_name', m.sheet_name, 'region', m.region) order by o.created_at)
      from public.nk_orders o join public.nk_members m on m.id = o.member_id
     where o.kind = 'book' and o.state >= 1 and o.sheet_synced_at is null), '[]');
end $$;

-- 반영 결과 기록. p_done=true 면 반영 끝, false 면 확인할 점만 남기고 다음에 다시 시도
create or replace function public.nk_sheet_mark(p_key text, p_id bigint, p_done boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  update public.nk_orders
     set sheet_synced_at = case when p_done then now() else sheet_synced_at end,
         sheet_note = nullif(p_note, ''),
         updated_at = now(),
         log = case when p_done then log || jsonb_build_array(jsonb_build_object('at', now(), 't', '납품시트 반영' || coalesce(' · ' || nullif(p_note, ''), ''))) else log end
   where id = p_id;
end $$;

revoke all on function public.nk_sheet_key_ok(text), public.nk_sheet_pending(text), public.nk_sheet_mark(text,bigint,boolean,text) from public;
grant execute on function public.nk_sheet_pending(text), public.nk_sheet_mark(text,bigint,boolean,text) to anon, authenticated;

-- 열쇠 등록 (설치 때만 이 줄을 실제 열쇠로 바꿔 실행)
-- insert into public.nk_settings (k, v) values ('sheet_key_hash', crypt('<열쇠>', gen_salt('bf'))) on conflict (k) do update set v = excluded.v;
