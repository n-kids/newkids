-- 뉴키즈 주문앱 Supabase 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run.  여러 번 실행해도 안전합니다.
-- 맨 아래 nk_admins 에 관리자 화면에 로그인할 이메일(홈페이지 관리자 계정)을 넣으세요.
--
-- 구조
--   nk_members : 가입한 원 (관리자가 승인해야 주문 가능). 비밀번호는 해시로만 저장
--   nk_orders  : 교재·물품 주문과 A/S 신청 (kind = book / goods / as)
--   nk_admins  : 관리자 화면에 들어올 수 있는 이메일
--   원 어플은 표에 직접 접근하지 않고 아래 nk_* 함수만 부릅니다(가입 때 받은 token으로 본인 확인).
--   관리자 화면은 홈페이지 관리자 계정으로 로그인하고, nk_admins 에 있는 이메일만 표를 읽고 고칠 수 있습니다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.nk_members (
  id          uuid primary key default gen_random_uuid(),
  kg          text not null,                       -- 원 이름
  name        text not null,                       -- 성함
  phone       text not null unique,                -- 숫자만
  region      text not null check (region in ('김포','고양','파주','강화')),
  pin_hash    text not null,
  token       uuid not null default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  email       text,                                -- 견적서·거래명세서 받을 메일 (마지막에 쓴 것)
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.nk_orders (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.nk_members(id) on delete cascade,
  kind        text not null check (kind in ('book','goods','as')),
  month       text,                                -- 교재 호수 (12월호 등)
  lines       jsonb not null default '[]',         -- 교재: [{name,vendor,q:[만0..만5]}], 물품: [{type,name,vendor,price,qty}]
  quote_want  boolean not null default false,
  quote_email text,
  quote_sent  boolean not null default false,
  pay         text,                                -- bank / invoice
  stmt_want   boolean not null default false,
  stmt_email  text,
  stmt_at     timestamptz,
  stmt_sent   boolean not null default false,
  state       int not null default 0,              -- 0 접수, 1 확인, 2 발주완료(A/S: 업체 접수), 3 배송중(A/S: 처리완료)
  done        jsonb not null default '{}',         -- 업체별 발주 완료 {"키즈엠":true}
  as_info     jsonb,                               -- {prog, step, ho, vendor}
  photos      jsonb,                               -- A/S 사진 (data URL 배열, 장당 약 150KB)
  memo        text,
  log         jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists nk_orders_member_idx on public.nk_orders(member_id, created_at desc);

create table if not exists public.nk_admins (email text primary key);

alter table public.nk_members enable row level security;
alter table public.nk_orders  enable row level security;
alter table public.nk_admins  enable row level security;

create or replace function public.nk_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nk_admins where email = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists nk_members_admin on public.nk_members;
create policy nk_members_admin on public.nk_members for all to authenticated using (public.nk_is_admin()) with check (public.nk_is_admin());
drop policy if exists nk_orders_admin on public.nk_orders;
create policy nk_orders_admin on public.nk_orders for all to authenticated using (public.nk_is_admin()) with check (public.nk_is_admin());
drop policy if exists nk_admins_self on public.nk_admins;
create policy nk_admins_self on public.nk_admins for select to authenticated using (email = lower(auth.jwt() ->> 'email'));

-- ---------- 원 어플용 함수 ----------
create or replace function public.nk_digits(p text) returns text language sql immutable as $$ select regexp_replace(coalesce(p,''), '\D', '', 'g') $$;

create or replace function public.nk_member_json(m public.nk_members) returns jsonb language sql stable as $$
  select jsonb_build_object('token', m.token, 'kg', m.kg, 'name', m.name, 'phone', m.phone, 'region', m.region, 'status', m.status, 'email', m.email)
$$;

create or replace function public.nk_signup(p_kg text, p_name text, p_phone text, p_region text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.nk_members; ph text := public.nk_digits(p_phone);
begin
  if length(trim(coalesce(p_kg,''))) = 0 or length(trim(coalesce(p_name,''))) = 0 then raise exception '원 이름과 성함을 적어주세요.'; end if;
  if length(ph) not between 10 and 11 then raise exception '휴대폰 번호를 확인해 주세요.'; end if;
  if p_pin !~ '^\d{4,8}$' then raise exception '비밀번호는 숫자 4~8자리로 정해주세요.'; end if;
  if exists (select 1 from public.nk_members where phone = ph) then raise exception '이미 가입한 번호예요. 로그인해 주세요.'; end if;
  insert into public.nk_members (kg, name, phone, region, pin_hash)
  values (trim(p_kg), trim(p_name), ph, p_region, crypt(p_pin, gen_salt('bf')))
  returning * into m;
  return public.nk_member_json(m);
end $$;

create or replace function public.nk_login(p_phone text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where phone = public.nk_digits(p_phone);
  if m.id is null or m.pin_hash <> crypt(p_pin, m.pin_hash) then raise exception '번호나 비밀번호가 맞지 않아요.'; end if;
  return public.nk_member_json(m);
end $$;

create or replace function public.nk_me(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  return public.nk_member_json(m);
end $$;

create or replace function public.nk_place_order(p_token uuid, p_order jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare m public.nk_members; oid bigint; k text := p_order ->> 'kind';
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  if m.status <> 'approved' then raise exception '가입 승인 후에 주문할 수 있어요. 승인되면 바로 쓰실 수 있습니다.'; end if;
  if k not in ('book','goods','as') then raise exception '주문 종류가 올바르지 않아요.'; end if;
  if k = 'as' and jsonb_array_length(coalesce(p_order -> 'photos', '[]')) = 0 then raise exception 'A/S는 사진을 꼭 올려주세요.'; end if;
  insert into public.nk_orders (member_id, kind, month, lines, quote_want, quote_email, pay, as_info, photos, memo, log)
  values (m.id, k, p_order ->> 'month', coalesce(p_order -> 'lines', '[]'),
          coalesce((p_order ->> 'quote_want')::boolean, false), nullif(p_order ->> 'quote_email', ''),
          p_order ->> 'pay', p_order -> 'as_info', p_order -> 'photos', nullif(p_order ->> 'memo', ''),
          jsonb_build_array(jsonb_build_object('at', now(), 't', case when coalesce((p_order ->> 'quote_want')::boolean, false) then '접수 · 견적서 요청' else '접수' end)))
  returning id into oid;
  if nullif(p_order ->> 'quote_email', '') is not null then update public.nk_members set email = p_order ->> 'quote_email' where id = m.id; end if;
  return oid;
end $$;

create or replace function public.nk_my_orders(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(o) - 'photos' - 'member_id' order by o.created_at desc)
                   from (select * from public.nk_orders where member_id = m.id order by created_at desc limit 100) o), '[]');
end $$;

create or replace function public.nk_request_stmt(p_token uuid, p_order_id bigint, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  if p_email !~ '.+@.+\..+' then raise exception '메일 주소를 확인해 주세요.'; end if;
  update public.nk_orders set stmt_want = true, stmt_email = p_email, stmt_at = now(), updated_at = now(),
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 't', '거래명세서 요청'))
   where id = p_order_id and member_id = m.id;
  update public.nk_members set email = p_email where id = m.id;
end $$;

revoke all on function public.nk_signup(text,text,text,text,text), public.nk_login(text,text), public.nk_me(uuid),
  public.nk_place_order(uuid,jsonb), public.nk_my_orders(uuid), public.nk_request_stmt(uuid,bigint,text) from public;
grant execute on function public.nk_signup(text,text,text,text,text), public.nk_login(text,text), public.nk_me(uuid),
  public.nk_place_order(uuid,jsonb), public.nk_my_orders(uuid), public.nk_request_stmt(uuid,bigint,text) to anon, authenticated;
grant execute on function public.nk_is_admin() to authenticated;

-- ---------- 관리자 이메일 ----------
-- 홈페이지 관리자 화면에 로그인할 때 쓰는 이메일을 넣으세요 (여러 개 가능).
insert into public.nk_admins (email) values ('관리자이메일@example.com') on conflict do nothing;
