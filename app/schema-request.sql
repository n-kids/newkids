-- 뉴키즈 주문앱: 단순 문의 · 행사 문의 · 반품 요청 (schema.sql, schema-sheet.sql, schema-secure.sql 다음에 실행. 여러 번 실행해도 안전)
--
-- kind 추가: ask(단순 문의) / event(행사 문의) / return(반품 요청). 내용은 as_info·memo·photos 칸을 같이 씀.
--   ask    : as_info {topic},                       memo 필수
--   event  : as_info {group, name, date, phone},    memo 선택  (행사는 2027 프로그램북 행사 중에서 고름, 연락처 필수)
--   return : as_info {cat:'교재', item, ho, qty, reason, vendor},  photos 선택  (교재만, 교재·호수 필수)
-- 주문 칸 검사도 함께 강화: month 는 "N월호", pay 는 bank/invoice, 사진은 data:image 만 받음 (관리자 화면에 그대로 그려지는 값이라서)

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.nk_orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.nk_orders drop constraint %I', c);
  end loop;
end $$;
alter table public.nk_orders add constraint nk_orders_kind_check check (kind in ('book','goods','as','ask','event','return'));

create or replace function public.nk_place_order(p_token uuid, p_order jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare m public.nk_members; oid bigint; k text := p_order ->> 'kind'; ph jsonb := p_order -> 'photos';
begin
  select * into m from public.nk_members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.'; end if;
  if m.status <> 'approved' then raise exception '가입 승인 후에 주문할 수 있어요. 승인되면 바로 쓰실 수 있습니다.'; end if;
  if k is null or k not in ('book','goods','as','ask','event','return') then raise exception '주문 종류가 올바르지 않아요.'; end if;
  if k = 'as' and jsonb_array_length(coalesce(ph, '[]')) = 0 then raise exception 'A/S는 사진을 꼭 올려주세요.'; end if;
  if k = 'ask' and length(trim(coalesce(p_order ->> 'memo', ''))) = 0 then raise exception '문의 내용을 적어주세요.'; end if;
  if k = 'event' and (length(trim(coalesce(p_order -> 'as_info' ->> 'name', ''))) = 0 or length(trim(coalesce(p_order -> 'as_info' ->> 'date', ''))) = 0
     or length(public.nk_digits(p_order -> 'as_info' ->> 'phone')) not between 9 and 11) then raise exception '행사, 날짜, 연락받을 번호를 확인해 주세요.'; end if;
  if k = 'return' and (length(trim(coalesce(p_order -> 'as_info' ->> 'item', ''))) = 0 or length(trim(coalesce(p_order -> 'as_info' ->> 'ho', ''))) = 0) then raise exception '반품할 교재와 호수를 골라주세요.'; end if;
  if (p_order ->> 'month') is not null and (p_order ->> 'month') !~ '^[0-9]{1,2}월호$' then raise exception '호수가 올바르지 않아요.'; end if;
  if (p_order ->> 'pay') is not null and (p_order ->> 'pay') not in ('bank','invoice') then raise exception '결제 방법이 올바르지 않아요.'; end if;
  if ph is not null and jsonb_typeof(ph) <> 'null' and (jsonb_typeof(ph) <> 'array' or jsonb_array_length(ph) > 4
     or exists (select 1 from jsonb_array_elements(ph) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'))
  then raise exception '사진을 다시 올려주세요.'; end if;
  insert into public.nk_orders (member_id, kind, month, lines, quote_want, quote_email, pay, as_info, photos, memo, log)
  values (m.id, k, p_order ->> 'month', coalesce(p_order -> 'lines', '[]'),
          coalesce((p_order ->> 'quote_want')::boolean, false), nullif(p_order ->> 'quote_email', ''),
          p_order ->> 'pay', p_order -> 'as_info', ph, nullif(p_order ->> 'memo', ''),
          jsonb_build_array(jsonb_build_object('at', now(), 't', case when coalesce((p_order ->> 'quote_want')::boolean, false) then '접수 · 견적서 요청' else '접수' end)))
  returning id into oid;
  if nullif(p_order ->> 'quote_email', '') is not null then update public.nk_members set email = p_order ->> 'quote_email' where id = m.id; end if;
  return oid;
end $$;
