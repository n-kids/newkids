-- 뉴키즈 주문앱 → 엔터코딩 납품앱(ec_records) 연동 (schema-sheet.sql 다음에 실행. 여러 번 실행해도 안전)
-- 메인 컴퓨터 sync-delivery.ps1 이 15분마다 아래 두 함수만 부릅니다. 본인 확인은 납품시트 반영과 같은 열쇠(nk_settings.sheet_key_hash).
--   nk_ec_pending : 관리자가 "확인"한 교재 주문 중 아직 납품앱에 안 넘긴 것
--   nk_ec_push    : 한 주문의 직납 품목을 납품앱 원 카드에 더하고(없으면 새 카드), 주문에 "납품앱 반영" 기록
-- 어떤 품목이 직납인지(엔터코딩, 원별 레디셋·책톡톡 등)는 스크립트 쪽 표에서 정함. 이 함수는 받은 품목을 그대로 넣기만 함.

alter table public.nk_orders add column if not exists ec_synced_at timestamptz;   -- 납품앱에 넘긴 때 (직납 품목이 없어도 '확인함'으로 찍음)
alter table public.nk_orders add column if not exists ec_note text;               -- 넘기면서 남긴 메모

-- 원 이름 비교용: 띄어쓰기·괄호·시립 등 앞말·유치원/어린이집 뒷말 빼고 비교
create or replace function public.nk_ec_norm(p text) returns text language sql immutable as $$
  select lower(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p,''), '\s+', '', 'g'), '\(.*?\)', '', 'g'),
         '^(고양시립|김포시립|파주시립|시립|국공립|구립|사립|법인|직장)', ''), '(병설유치원|유치원|어린이집)$', ''))
$$;

create or replace function public.nk_ec_pending(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'month', o.month, 'lines', o.lines, 'created_at', o.created_at,
                                        'kg', m.kg, 'sheet_name', m.sheet_name, 'region', m.region) order by o.created_at)
      from public.nk_orders o join public.nk_members m on m.id = o.member_id
     where o.kind = 'book' and o.state >= 1 and o.ec_synced_at is null), '[]');
end $$;

-- p_items: [{"product":"엔터코딩","q":{"1":10,"2":9}} , {"extra":"레디셋잉글리시 B","qty":18}]  (빈 배열이면 기록만)
-- 결과: {"rid":"12","name":"…","new":true/false}
create or replace function public.nk_ec_push(p_key text, p_id bigint, p_school text, p_region text, p_items jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; v jsonb; rid_ text; is_new boolean := false; it jsonb; prods jsonb; i int; n int; found_ boolean; ex jsonb; tag text := '앱#' || p_id;
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  if exists (select 1 from public.nk_orders where id = p_id and ec_synced_at is not null) then return jsonb_build_object('skip', true); end if;

  if jsonb_array_length(coalesce(p_items, '[]')) > 0 then
    -- 같은 원(이름 비교)의 아직 완료 안 된 카드
    select r.rid, r.value into rec from public.ec_records r
     where r.kind = 'school' and not r.deleted and r.value is not null
       and public.nk_ec_norm(r.value->>'name') = public.nk_ec_norm(p_school)
       and not exists (select 1 from public.ec_records d where d.kind = 'done' and d.rid = r.rid and not d.deleted and d.value is not null)
     order by r.updated_at desc limit 1
     for update;
    if found then
      rid_ := rec.rid; v := rec.value;
    else
      is_new := true;
      select coalesce(max(nullif(regexp_replace(rid, '\D', '', 'g'), '')::bigint), 0) + 1 into n from public.ec_records where kind = 'school';
      rid_ := n::text;
      v := jsonb_build_object('id', n, 'order', n, 'name', p_school, 'address', '', 'phone', '',
             'regionGroup', coalesce(nullif(p_region, ''), '기타'), 'subRegion', '기타',
             'url', 'https://map.kakao.com/link/search/' || replace(p_school, ' ', '%20'),
             'lat', null, 'lng', null, 'product', '', 'q1', 0, 'q2', 0, 'q3', 0, 'q4', 0, 't1', 0, 't2', 0, 't3', 0, 't4', 0,
             'extras', '[]'::jsonb, 'cardYellow', true);
    end if;
    if coalesce(v->'appOrders', '[]') ? p_id::text then return jsonb_build_object('rid', rid_, 'skip', true); end if;

    for it in select * from jsonb_array_elements(p_items) loop
      if it ? 'product' then
        if coalesce(v->>'product', '') = '' then v := v || jsonb_build_object('product', it->>'product'); end if;
        if v->>'product' = it->>'product' then
          for i in 1..4 loop v := jsonb_set(v, array['q' || i], to_jsonb(coalesce((v->>('q' || i))::int, 0) + coalesce((it->'q'->>i::text)::int, 0))); end loop;
        else
          prods := case when jsonb_typeof(v->'moreProducts') = 'array' then v->'moreProducts' else '[]' end; found_ := false;
          for i in 0..jsonb_array_length(prods) - 1 loop
            if prods->i->>'name' = it->>'product' then
              found_ := true;
              for n in 1..4 loop prods := jsonb_set(prods, array[i::text, 'q' || n], to_jsonb(coalesce((prods->i->>('q' || n))::int, 0) + coalesce((it->'q'->>n::text)::int, 0))); end loop;
            end if;
          end loop;
          if not found_ then
            prods := prods || jsonb_build_array(jsonb_build_object('name', it->>'product',
                       'q1', coalesce((it->'q'->>'1')::int, 0), 'q2', coalesce((it->'q'->>'2')::int, 0), 'q3', coalesce((it->'q'->>'3')::int, 0), 'q4', coalesce((it->'q'->>'4')::int, 0),
                       't1', 0, 't2', 0, 't3', 0, 't4', 0));
          end if;
          v := v || jsonb_build_object('moreProducts', prods);
        end if;
      elsif it ? 'extra' then
        ex := case when jsonb_typeof(v->'extras') = 'array' then v->'extras' else '[]' end; found_ := false;
        for i in 0..jsonb_array_length(ex) - 1 loop
          if ex->i->>'name' = it->>'extra' then found_ := true; ex := jsonb_set(ex, array[i::text, 'qty'], to_jsonb(coalesce((ex->i->>'qty')::int, 0) + (it->>'qty')::int)); end if;
        end loop;
        if not found_ then ex := ex || jsonb_build_array(jsonb_build_object('name', it->>'extra', 'qty', (it->>'qty')::int)); end if;
        v := v || jsonb_build_object('extras', ex);
      end if;
    end loop;
    v := v || jsonb_build_object('appOrders', coalesce(v->'appOrders', '[]') || to_jsonb(p_id::text));

    insert into public.ec_records (kind, rid, value, deleted, updated_by) values ('school', rid_, v, false, 'nk-order-app')
      on conflict (kind, rid) do update set value = excluded.value, deleted = false, updated_by = excluded.updated_by;
    if is_new then
      insert into public.ec_records (kind, rid, value, deleted, updated_by)
        values ('meta', 'order', coalesce((select r.value from public.ec_records r where r.kind = 'meta' and r.rid = 'order' and not r.deleted and jsonb_typeof(r.value) = 'array'), '[]') || to_jsonb(rid_::bigint), false, 'nk-order-app')
        on conflict (kind, rid) do update set value = excluded.value, deleted = false, updated_by = excluded.updated_by;
    end if;
  end if;

  update public.nk_orders
     set ec_synced_at = now(), ec_note = nullif(p_note, ''), updated_at = now(),
         log = case when jsonb_array_length(coalesce(p_items, '[]')) > 0
                    then log || jsonb_build_array(jsonb_build_object('at', now(), 't', '납품앱 반영' || coalesce(' · ' || nullif(p_note, ''), ''))) else log end
   where id = p_id;
  return jsonb_build_object('rid', rid_, 'name', coalesce(v->>'name', p_school), 'new', is_new);
end $$;

revoke all on function public.nk_ec_pending(text), public.nk_ec_push(text,bigint,text,text,jsonb,text) from public;
grant execute on function public.nk_ec_pending(text), public.nk_ec_push(text,bigint,text,text,jsonb,text) to anon, authenticated;
