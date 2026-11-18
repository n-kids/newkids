-- 뉴키즈 주문앱: 원장님 행사 참가 신청 (schema.sql ~ schema-request.sql 다음에 실행. 여러 번 실행해도 안전)
--
-- 관리자 화면 "원장님 행사" 탭에서 행사를 만들고 "앱에 띄우기"를 켜면, 원 어플 홈에 신청 버튼이 생김.
-- 원은 한 행사에 한 번 신청(참석자 성함·연락처·인원·메모), 마감 전까지 고치거나 취소할 수 있음.
-- 연락처는 회원 전화번호처럼 Vault 열쇠로 암호화(nk_phone_enc), 관리자는 nk_admin_gathering_signups()로 풀어서 봄.

create table if not exists public.nk_gatherings (
  id          bigint generated always as identity primary key,
  title       text not null,                 -- 행사 이름 (홈 버튼 제목)
  when_text   text,                          -- 일시 (자유 입력: "12월 5일(금) 오전 11시")
  place       text,                          -- 장소
  body        text,                          -- 안내 내용
  deadline    date,                          -- 신청 마감일 (이 날까지 신청 가능, 비우면 마감 없음)
  max_count   int,                           -- 최대 인원 (비우면 제한 없음)
  open        boolean not null default false, -- 앱에 띄우기
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.nk_gathering_signups (
  id           bigint generated always as identity primary key,
  gathering_id bigint not null references public.nk_gatherings(id) on delete cascade,
  member_id    uuid not null references public.nk_members(id) on delete cascade,
  name         text not null,                -- 참석자 성함
  phone_enc    bytea,                        -- 참석자 연락처 (암호화)
  people       int not null default 1 check (people between 1 and 20),
  memo         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (gathering_id, member_id)
);

alter table public.nk_gatherings enable row level security;
alter table public.nk_gathering_signups enable row level security;
drop policy if exists nk_gatherings_admin on public.nk_gatherings;
create policy nk_gatherings_admin on public.nk_gatherings for all to authenticated using (public.nk_is_admin()) with check (public.nk_is_admin());
drop policy if exists nk_gathering_signups_admin on public.nk_gathering_signups;
create policy nk_gathering_signups_admin on public.nk_gathering_signups for all to authenticated using (public.nk_is_admin()) with check (public.nk_is_admin());

-- 원 어플: 지금 신청받는 행사 + 우리 원이 신청한 내용
create or replace function public.nk_open_gatherings(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'title', g.title, 'when_text', g.when_text, 'place', g.place, 'body', g.body, 'deadline', g.deadline,
      'closed', (g.deadline is not null and g.deadline < (now() at time zone 'Asia/Seoul')::date)
                or (g.max_count is not null and (select coalesce(sum(people),0) from public.nk_gathering_signups x where x.gathering_id = g.id and x.member_id <> m.id) >= g.max_count),
      'mine', (select jsonb_build_object('name', s.name, 'phone', public.nk_phone_dec(s.phone_enc), 'people', s.people, 'memo', s.memo)
               from public.nk_gathering_signups s where s.gathering_id = g.id and s.member_id = m.id)
    ) order by g.created_at desc) from public.nk_gatherings g where g.open), '[]');
end $$;

-- 신청 또는 고치기 (한 원에 한 번)
create or replace function public.nk_gathering_signup(p_token uuid, p_id bigint, p_name text, p_phone text, p_people int, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.nk_members; g public.nk_gatherings; used int;
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  if m.status <> 'approved' then raise exception '가입 승인 후에 신청할 수 있어요.'; end if;
  select * into g from public.nk_gatherings where id = p_id and open;
  if g.id is null then raise exception '지금은 신청을 받지 않는 행사예요.'; end if;
  if g.deadline is not null and g.deadline < (now() at time zone 'Asia/Seoul')::date then raise exception '신청이 마감됐어요.'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception '참석하실 분 성함을 적어주세요.'; end if;
  if length(public.nk_digits(p_phone)) not between 9 and 11 then raise exception '연락처를 확인해 주세요.'; end if;
  if coalesce(p_people,0) not between 1 and 20 then raise exception '인원을 확인해 주세요.'; end if;
  if g.max_count is not null then
    select coalesce(sum(people),0) into used from public.nk_gathering_signups where gathering_id = g.id and member_id <> m.id;
    if used + p_people > g.max_count then raise exception '자리가 % 명 남았어요.', greatest(g.max_count - used, 0); end if;
  end if;
  insert into public.nk_gathering_signups (gathering_id, member_id, name, phone_enc, people, memo)
  values (g.id, m.id, left(trim(p_name), 40), public.nk_phone_enc(p_phone), p_people, nullif(left(trim(coalesce(p_memo,'')), 500), ''))
  on conflict (gathering_id, member_id) do update
    set name = excluded.name, phone_enc = excluded.phone_enc, people = excluded.people, memo = excluded.memo, updated_at = now();
end $$;

create or replace function public.nk_gathering_cancel(p_token uuid, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  delete from public.nk_gathering_signups where gathering_id = p_id and member_id = m.id;
end $$;

-- 관리자: 신청 명단 (연락처를 풀어서)
create or replace function public.nk_admin_gathering_signups(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.nk_is_admin() then raise exception '관리자만 볼 수 있어요.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kg', m.kg, 'region', m.region, 'name', s.name,
      'phone', public.nk_phone_dec(s.phone_enc), 'people', s.people, 'memo', s.memo, 'created_at', s.created_at) order by s.created_at)
    from public.nk_gathering_signups s join public.nk_members m on m.id = s.member_id where s.gathering_id = p_id), '[]');
end $$;

revoke all on function public.nk_open_gatherings(uuid), public.nk_gathering_signup(uuid,bigint,text,text,int,text), public.nk_gathering_cancel(uuid,bigint) from public;
grant execute on function public.nk_open_gatherings(uuid), public.nk_gathering_signup(uuid,bigint,text,text,int,text), public.nk_gathering_cancel(uuid,bigint) to anon, authenticated;
revoke all on function public.nk_admin_gathering_signups(bigint) from public, anon;
grant execute on function public.nk_admin_gathering_signups(bigint) to authenticated;
