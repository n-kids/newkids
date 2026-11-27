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

-- ===== 웍스 [반품] 할 일 ↔ 납품앱 회수·반품 (2026-11-06) =====
-- 메인 PC sync-returns.py 가 15분마다: 열린 [반품] 할 일을 pickup 기록으로 올리고(nk_ec_pickup_put),
-- 납품앱에서 완료 체크된 것(nk_ec_pickups)을 웍스에서 완료 처리한 뒤 worksDoneAt 을 적는다.
create or replace function public.nk_ec_pickups(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('rid', rid, 'value', value) order by rid)
                     from public.ec_records where kind in ('pickup', 'school') and not deleted and value is not null), '[]');
end $$;

create or replace function public.nk_ec_pickup_put(p_key text, p_rid text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  if coalesce(p_rid, '') = '' or p_value->>'id' is distinct from p_rid then raise exception 'bad pickup id'; end if;
  insert into public.ec_records (kind, rid, value, deleted, updated_by) values ('pickup', p_rid, p_value, false, 'nk-works')
    on conflict (kind, rid) do update set value = excluded.value, deleted = false, updated_by = excluded.updated_by;
end $$;

revoke all on function public.nk_ec_pickups(text), public.nk_ec_pickup_put(text,text,jsonb) from public;
grant execute on function public.nk_ec_pickups(text), public.nk_ec_pickup_put(text,text,jsonb) to anon, authenticated;

-- ===== 납품시트 엔터코딩 칸 → 납품앱 원 카드 (2026-11-27) =====
-- 메인 PC sync-delivery-sheet.ps1 이 15분마다 그 달(매달 15일부터 다음 달) 시트의 엔터코딩 1~4단계 수량을 보냄.
-- 카드에 sheetMonth(예 '26.12')·sheetQ(마지막으로 반영한 시트 수량)를 남겨, 같은 달이면 차이만 더하고(손으로 고친 수량 보존),
-- 달이 바뀌면 같은 카드를 새 달 수량으로 바꾸고 납품완료·품목 체크를 푼다. 새 달 시트에 없는 원 카드는 수량 0.
-- p_rows: [{"name":"시립풍무어린이집","q":{"1":0,"2":60,"3":29,"4":0},"geo":{address,phone,url,lat,lng,regionGroup,subRegion}}]
-- p_apply=false 면 바꿀 내용만 돌려줌.
create or replace function public.nk_ec_sheet_apply(p_key text, p_month text, p_rows jsonb, p_apply boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  row_ jsonb; rec record; v jsonb; sq jsonb; nq jsonb; rid_ text; n bigint; i int; d int; cur int;
  changes jsonb := '[]'; seen text[] := '{}'; kind_ text; detail jsonb;
begin
  if not public.nk_sheet_key_ok(p_key) then raise exception 'sheet key mismatch'; end if;
  if p_month !~ '^\d\d\.\d\d$' then raise exception 'bad month'; end if;

  for row_ in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    nq := jsonb_build_object('1', coalesce((row_->'q'->>'1')::int,0), '2', coalesce((row_->'q'->>'2')::int,0),
                             '3', coalesce((row_->'q'->>'3')::int,0), '4', coalesce((row_->'q'->>'4')::int,0));
    select r.rid, r.value into rec from public.ec_records r
     where r.kind = 'school' and not r.deleted and r.value is not null
       and r.value->>'product' = '엔터코딩' and public.nk_ec_norm(r.value->>'name') = public.nk_ec_norm(row_->>'name')
     order by r.updated_at desc limit 1;
    if not found then
      select coalesce(max(nullif(regexp_replace(rid, '\D', '', 'g'), '')::bigint), 0) + 1 into n from public.ec_records where kind = 'school';
      rid_ := n::text; kind_ := 'new';
      v := coalesce(row_->'geo', '{}') || jsonb_build_object('id', n, 'order', n, 'name', row_->>'name', 'product', '엔터코딩',
             'q1', nq->'1', 'q2', nq->'2', 'q3', nq->'3', 'q4', nq->'4', 't1', 0, 't2', 0, 't3', 0, 't4', 0,
             'extras', '[]'::jsonb, 'cardYellow', true, 'sheetMonth', p_month, 'sheetQ', nq);
      if not (v ? 'regionGroup') then v := v || '{"regionGroup":"기타","subRegion":"기타"}'; end if;
      detail := nq;
    else
      rid_ := rec.rid; v := rec.value; seen := seen || rid_;
      if v->>'sheetMonth' = p_month then
        kind_ := 'delta'; sq := coalesce(v->'sheetQ', '{}'); detail := '{}';
        for i in 1..4 loop
          d := (nq->>i::text)::int - coalesce((sq->>i::text)::int, 0);
          if d <> 0 then
            cur := coalesce((v->>('q' || i))::int, 0);
            v := jsonb_set(v, array['q' || i], to_jsonb(greatest(cur + d, 0)));
            detail := detail || jsonb_build_object(i::text, d);
          end if;
        end loop;
        if detail = '{}' then continue; end if;
        v := v || jsonb_build_object('sheetQ', nq);
      else
        kind_ := 'month'; detail := nq;
        v := v || jsonb_build_object('q1', nq->'1', 'q2', nq->'2', 'q3', nq->'3', 'q4', nq->'4', 'sheetMonth', p_month, 'sheetQ', nq);
      end if;
    end if;
    changes := changes || jsonb_build_array(jsonb_build_object('rid', rid_, 'name', v->>'name', 'kind', kind_, 'q', detail));
    if p_apply then
      insert into public.ec_records (kind, rid, value, deleted, updated_by) values ('school', rid_, v, false, 'nk-sheet')
        on conflict (kind, rid) do update set value = excluded.value, deleted = false, updated_by = excluded.updated_by;
      if kind_ = 'new' then
        insert into public.ec_records (kind, rid, value, deleted, updated_by)
          values ('meta', 'order', coalesce((select r.value from public.ec_records r where r.kind = 'meta' and r.rid = 'order' and not r.deleted and jsonb_typeof(r.value) = 'array'), '[]') || to_jsonb(rid_::bigint), false, 'nk-sheet')
          on conflict (kind, rid) do update set value = excluded.value, deleted = false, updated_by = excluded.updated_by;
      elsif kind_ = 'month' then
        update public.ec_records set value = null, deleted = true, updated_by = 'nk-sheet' where kind in ('done', 'check') and rid = rid_ and not deleted;
      end if;
    end if;
  end loop;

  -- 지난달 시트에서 온 카드인데 이번 달 시트에 없는 원 → 수량 0 으로 새 달
  for rec in select r.rid, r.value from public.ec_records r
              where r.kind = 'school' and not r.deleted and r.value is not null and r.value->>'product' = '엔터코딩'
                and r.value ? 'sheetMonth' and r.value->>'sheetMonth' <> p_month and not (r.rid = any(seen)) loop
    v := rec.value || jsonb_build_object('q1', 0, 'q2', 0, 'q3', 0, 'q4', 0, 'sheetMonth', p_month, 'sheetQ', '{"1":0,"2":0,"3":0,"4":0}'::jsonb);
    changes := changes || jsonb_build_array(jsonb_build_object('rid', rec.rid, 'name', v->>'name', 'kind', 'zero'));
    if p_apply then
      update public.ec_records set value = v, updated_by = 'nk-sheet' where kind = 'school' and rid = rec.rid;
      update public.ec_records set value = null, deleted = true, updated_by = 'nk-sheet' where kind in ('done', 'check') and rid = rec.rid and not deleted;
    end if;
  end loop;
  return changes;
end $$;

revoke all on function public.nk_ec_sheet_apply(text,text,jsonb,boolean) from public;
grant execute on function public.nk_ec_sheet_apply(text,text,jsonb,boolean) to anon, authenticated;
