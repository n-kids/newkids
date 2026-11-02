-- 뉴키즈 주문앱: 비밀번호 2중 해시 · 전화번호 양방향 암호화 (schema.sql, schema-sheet.sql 다음에 실행. 여러 번 실행해도 안전)
--
-- 비밀번호: 휴대폰에서 SHA-256(“nk-order|전화번호숫자|비밀번호”)로 먼저 해시해서 보내고(원래 비밀번호는 기기 밖으로 안 나감),
--           서버는 그 값을 bcrypt로 한 번 더 해시해 저장 (pin_ver = 2).
--           예전 방식(pin_ver = 1)으로 가입한 원은 다음 로그인 때 nk_login_upgrade 로 한 번 확인한 뒤 새 방식으로 바뀜.
-- 전화번호: Supabase Vault 의 비밀 열쇠(nk_phone_key)로 pgp_sym_encrypt 해서 phone_enc 에 저장(양방향).
--           찾기·중복 확인은 같은 열쇠를 섞은 HMAC-SHA256 값(phone_hash)으로만 함. 평문 phone 열은 지움.
--           풀어서 보는 곳: 본인(nk_me 등)과 관리자(nk_admin_members)뿐.

-- ---------- 열쇠 (Vault) ----------
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'nk_phone_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'nk_phone_key', '주문앱 전화번호 암호화 열쇠');
  end if;
end $$;

create or replace function public.nk_phone_key() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'nk_phone_key' limit 1;
$$;
revoke all on function public.nk_phone_key() from public, anon, authenticated;

create or replace function public.nk_phone_hash(p text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(public.nk_digits(p), public.nk_phone_key(), 'sha256'), 'hex');
$$;
create or replace function public.nk_phone_enc(p text) returns bytea
language sql stable security definer set search_path = public, extensions as $$
  select pgp_sym_encrypt(public.nk_digits(p), public.nk_phone_key());
$$;
create or replace function public.nk_phone_dec(b bytea) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when b is null then null else pgp_sym_decrypt(b, public.nk_phone_key()) end;
$$;
revoke all on function public.nk_phone_hash(text), public.nk_phone_enc(text), public.nk_phone_dec(bytea) from public, anon, authenticated;

-- ---------- 표 바꾸기 ----------
alter table public.nk_members add column if not exists phone_enc bytea;
alter table public.nk_members add column if not exists phone_hash text;
alter table public.nk_members add column if not exists pin_ver int not null default 1;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nk_members' and column_name = 'phone') then
    update public.nk_members set phone_enc = public.nk_phone_enc(phone), phone_hash = public.nk_phone_hash(phone) where phone_hash is null;
    alter table public.nk_members drop column phone;
  end if;
end $$;
create unique index if not exists nk_members_phone_hash_key on public.nk_members(phone_hash);

-- ---------- 원 어플용 함수 (다시 만듦) ----------
drop function if exists public.nk_member_json(public.nk_members);
create or replace function public.nk_member_json(m public.nk_members) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('token', m.token, 'kg', m.kg, 'name', m.name, 'phone', public.nk_phone_dec(m.phone_enc), 'region', m.region, 'status', m.status, 'email', m.email)
$$;
revoke all on function public.nk_member_json(public.nk_members) from public, anon, authenticated;

-- p_pin = 휴대폰에서 만든 SHA-256 값(64자리 16진수)
create or replace function public.nk_signup(p_kg text, p_name text, p_phone text, p_region text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.nk_members; ph text := public.nk_digits(p_phone); h text;
begin
  if length(trim(coalesce(p_kg,''))) = 0 or length(trim(coalesce(p_name,''))) = 0 then raise exception '원 이름과 성함을 적어주세요.'; end if;
  if length(ph) not between 10 and 11 then raise exception '휴대폰 번호를 확인해 주세요.'; end if;
  if p_pin !~ '^[0-9a-f]{64}$' then raise exception '앱을 새로 고침한 뒤 다시 시도해 주세요.'; end if;
  h := public.nk_phone_hash(ph);
  if exists (select 1 from public.nk_members where phone_hash = h) then raise exception '이미 가입한 번호예요. 로그인해 주세요.'; end if;
  insert into public.nk_members (kg, name, phone_enc, phone_hash, region, pin_hash, pin_ver)
  values (trim(p_kg), trim(p_name), public.nk_phone_enc(ph), h, p_region, crypt(p_pin, gen_salt('bf')), 2)
  returning * into m;
  return public.nk_member_json(m);
end $$;

create or replace function public.nk_login(p_phone text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where phone_hash = public.nk_phone_hash(p_phone);
  if m.id is null then raise exception '번호나 비밀번호가 맞지 않아요.'; end if;
  if m.pin_ver < 2 then raise exception 'NK_UPGRADE'; end if;   -- 예전 방식 → 앱이 nk_login_upgrade 로 한 번 확인
  if m.pin_hash <> crypt(p_pin, m.pin_hash) then raise exception '번호나 비밀번호가 맞지 않아요.'; end if;
  return public.nk_member_json(m);
end $$;

-- 예전 방식으로 가입한 원: 예전 비밀번호로 한 번 확인하고 새 방식(2중 해시)으로 바꿔 저장
create or replace function public.nk_login_upgrade(p_phone text, p_pin_old text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m public.nk_members;
begin
  select * into m from public.nk_members where phone_hash = public.nk_phone_hash(p_phone) and pin_ver < 2;
  if m.id is null or m.pin_hash <> crypt(p_pin_old, m.pin_hash) or p_pin !~ '^[0-9a-f]{64}$' then raise exception '번호나 비밀번호가 맞지 않아요.'; end if;
  update public.nk_members set pin_hash = crypt(p_pin, gen_salt('bf')), pin_ver = 2 where id = m.id returning * into m;
  return public.nk_member_json(m);
end $$;

-- 관리자 화면: 전화번호를 풀어서 보여줌 (nk_admins 만)
create or replace function public.nk_admin_members()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.nk_is_admin() then raise exception '관리자만 볼 수 있어요.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kg', kg, 'name', name, 'phone', public.nk_phone_dec(phone_enc), 'region', region,
                    'status', status, 'email', email, 'sheet_name', sheet_name, 'created_at', created_at, 'approved_at', approved_at) order by created_at desc)
                   from public.nk_members), '[]');
end $$;

revoke all on function public.nk_signup(text,text,text,text,text), public.nk_login(text,text), public.nk_login_upgrade(text,text,text) from public;
grant execute on function public.nk_signup(text,text,text,text,text), public.nk_login(text,text), public.nk_login_upgrade(text,text,text) to anon, authenticated;
revoke all on function public.nk_admin_members() from public, anon;
grant execute on function public.nk_admin_members() to authenticated;
