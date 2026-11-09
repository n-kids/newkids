begin;
create table public.page_editor_work_items (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('review','schedule','link')),
 page_key text not null check(page_key ~ '^(main|page:[a-zA-Z0-9_-]+)$'), status text not null,
 snapshot jsonb not null, draft_version bigint not null, created_by uuid not null,
 created_at timestamptz not null default now(), decided_by uuid, decided_at timestamptz,
 parent_id uuid references public.page_editor_work_items(id), starts_at timestamptz, ends_at timestamptz,
 expires_at timestamptz, token_hash text unique, previous_document jsonb,
 expected_publication_version bigint, applied_version bigint, error text
);
create index on public.page_editor_work_items(page_key,created_at desc);
create index on public.page_editor_work_items(starts_at) where kind='schedule' and status='scheduled';
create table public.page_editor_audit (
 id bigint generated always as identity primary key, page_key text not null,
 action text not null, actor uuid, happened_at timestamptz not null default now(), details jsonb not null
);
alter table public.page_editor_work_items enable row level security;
alter table public.page_editor_audit enable row level security;
revoke all on public.page_editor_work_items,public.page_editor_audit from public,anon,authenticated;
grant select on public.page_editor_work_items,public.page_editor_audit to authenticated;
create policy editor_work_read on public.page_editor_work_items for select to authenticated using(public.page_editor_is_admin());
create policy editor_audit_read on public.page_editor_audit for select to authenticated using(public.page_editor_is_admin());

create function public.page_editor_audit_event() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.page_editor_audit(page_key,action,actor,details)
 values(r->>'page_key',TG_TABLE_NAME||':'||TG_OP,auth.uid(),jsonb_build_object('version',r->'version','status',r->'status','item_id',r->'id','draft_version',r->'draft_version'));
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger editor_draft_audit after insert or update or delete on public.page_editor_drafts for each row execute function public.page_editor_audit_event();
create trigger editor_publication_audit after insert or update or delete on public.page_editor_publications for each row execute function public.page_editor_audit_event();
create trigger editor_work_audit after insert or update or delete on public.page_editor_work_items for each row execute function public.page_editor_audit_event();

create function public.page_editor_workflow(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text:=p_payload->>'page_key'; d public.page_editor_drafts; w public.page_editor_work_items;
 p public.page_editor_publications; token text; start_time timestamptz; end_time timestamptz; hours integer;
begin
 if not public.page_editor_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_action='capabilities' then return jsonb_build_object('enabled',true,'approval_required',true); end if;
 if p_action='state' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)-'token_hash') from (select * from public.page_editor_work_items where page_key=k order by created_at desc limit 50)x),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.page_editor_audit where page_key=k order by id desc limit 50)x),'[]'::jsonb));
 end if;
 if p_action in ('request','share') then
  select * into d from public.page_editor_drafts where page_key=k for update;
  if not found or d.version is distinct from (p_payload->>'version')::bigint then raise exception 'Draft changed: save and retry' using errcode='40001'; end if;
  if p_action='request' then
   insert into public.page_editor_work_items(kind,page_key,status,snapshot,draft_version,created_by)
   values('review',k,'pending',d.document,d.version,auth.uid()) returning * into w;
   return jsonb_build_object('id',w.id);
  end if;
  hours:=(p_payload->>'hours')::integer;
  if hours is null or hours<1 or hours>168 then raise exception 'Expiry must be 1 to 168 hours'; end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.page_editor_work_items(kind,page_key,status,snapshot,draft_version,created_by,expires_at,token_hash,previous_document)
  values('link',k,'active',d.document,d.version,auth.uid(),now()+make_interval(hours=>hours),encode(sha256(convert_to(token,'UTF8')),'hex'),coalesce((select document from public.page_editor_publications where page_key='page:defaults'),'{}'::jsonb)) returning * into w;
  return jsonb_build_object('id',w.id,'token',token,'expires_at',w.expires_at);
 end if;
 select page_key into k from public.page_editor_work_items where id=(p_payload->>'id')::uuid;
 if not found then raise exception 'Item not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 select * into w from public.page_editor_work_items where id=(p_payload->>'id')::uuid for update;
 if p_action='decide' then
  if w.kind<>'review' or w.status<>'pending' then raise exception 'Review is not pending'; end if;
  if (p_payload->>'approve')::boolean then
   if w.created_by=auth.uid() then raise exception 'A different administrator must approve' using errcode='42501'; end if;
   select * into d from public.page_editor_drafts where page_key=w.page_key for update;
   if d.version is distinct from w.draft_version or d.document is distinct from w.snapshot then raise exception 'Review snapshot is stale: submit again' using errcode='40001'; end if;
  end if;
  update public.page_editor_work_items set status=case when (p_payload->>'approve')::boolean then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now() where id=w.id;
 elsif p_action='schedule' then
  if w.kind<>'review' or w.status<>'approved' then raise exception 'Choose an approved review'; end if;
  start_time:=(p_payload->>'starts_at')::timestamptz;end_time:=(p_payload->>'ends_at')::timestamptz;
  if start_time is null or end_time is null or start_time<=now() or end_time<=start_time or start_time>now()+interval '366 days' then raise exception 'Invalid schedule window'; end if;
  perform pg_advisory_xact_lock(hashtextextended(w.page_key,0));
  if exists(select 1 from public.page_editor_work_items where kind='schedule' and page_key=w.page_key and status in ('scheduled','active') and tstzrange(starts_at,ends_at,'[)') && tstzrange(start_time,end_time,'[)')) then raise exception 'Schedule overlaps'; end if;
  select * into p from public.page_editor_publications where page_key=w.page_key for update;
  insert into public.page_editor_work_items(kind,page_key,status,snapshot,draft_version,created_by,parent_id,starts_at,ends_at,previous_document,expected_publication_version,decided_by)
  values('schedule',w.page_key,'scheduled',w.snapshot,w.draft_version,auth.uid(),w.id,start_time,end_time,p.document,coalesce(p.version,0),w.decided_by);
  update public.page_editor_work_items set status='scheduled' where id=w.id;
 elsif p_action='cancel' then
  if w.kind<>'schedule' or w.status not in ('scheduled','active') then raise exception 'Schedule cannot be cancelled'; end if;
  if w.status='active' then update public.page_editor_work_items set ends_at=now() where id=w.id;
  else update public.page_editor_work_items set status='cancelled' where id=w.id;update public.page_editor_work_items set status='approved' where id=w.parent_id and status='scheduled';end if;
 elsif p_action='revoke' then
  if w.kind<>'link' then raise exception 'Not a review link'; end if;
  update public.page_editor_work_items set status='revoked' where id=w.id;
 else raise exception 'Unsupported workflow action';end if;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.page_editor_publish(p_page_key text,p_expected_draft_version bigint)
returns public.page_editor_publications language plpgsql security definer set search_path='' as $$
declare d public.page_editor_drafts;p public.page_editor_publications;r public.page_editor_work_items;
begin
 if not public.page_editor_is_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_page_key,0));
 select * into d from public.page_editor_drafts where page_key=p_page_key for update;
 if not found or d.version is distinct from p_expected_draft_version then raise exception 'Draft changed' using errcode='40001';end if;
 select * into r from public.page_editor_work_items where kind='review' and page_key=p_page_key and status='approved' and snapshot=d.document order by decided_at desc limit 1 for update;
 if not found then raise exception 'This exact document requires approval by another administrator' using errcode='42501';end if;
 insert into public.page_editor_publications(page_key,document,published_by) values(p_page_key,d.document,auth.uid())
 on conflict(page_key) do update set document=excluded.document,version=public.page_editor_publications.version+1,published_at=now(),published_by=auth.uid() returning * into p;
 insert into public.page_editor_revisions(page_key,document,publication_version,created_by) values(p.page_key,p.document,p.version,auth.uid());
 update public.page_editor_work_items set status='published' where id=r.id;return p;
end $$;

create function public.page_editor_review_get(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.page_editor_work_items;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Review link unavailable' using errcode='42501';end if;
 select * into w from public.page_editor_work_items where kind='link' and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and status='active' and expires_at>now();
 if not found then raise exception 'Review link unavailable' using errcode='42501';end if;
 return jsonb_build_object('page_key',w.page_key,'document',w.snapshot,'common',w.previous_document,'version',w.draft_version,'expires_at',w.expires_at);
end $$;

create function public.page_editor_run_schedules() returns void language plpgsql security definer set search_path='' as $$
declare s public.page_editor_work_items;p public.page_editor_publications;v bigint;
begin
 for s in select * from public.page_editor_work_items where kind='schedule' and ((status='scheduled' and starts_at<=now()) or(status='active' and ends_at<=now())) order by starts_at for update skip locked loop
  begin
   if not pg_try_advisory_xact_lock(hashtextextended(s.page_key,0)) then continue;end if;
   select * into p from public.page_editor_publications where page_key=s.page_key for update;v:=coalesce(p.version,0);
   if s.status='scheduled' and s.ends_at<=now() then update public.page_editor_work_items set status='missed' where id=s.id;continue;end if;
   if v<>case when s.status='scheduled' then s.expected_publication_version else s.applied_version end then update public.page_editor_work_items set status='conflict',error='Publication changed; no overwrite performed' where id=s.id;continue;end if;
   if s.status='active' and s.previous_document is null then
    delete from public.page_editor_publications where page_key=s.page_key;
   else
    insert into public.page_editor_publications(page_key,document,version,published_by) values(s.page_key,case when s.status='scheduled' then s.snapshot else s.previous_document end,v+1,s.decided_by)
    on conflict(page_key) do update set document=excluded.document,version=excluded.version,published_at=now(),published_by=excluded.published_by returning * into p;
    insert into public.page_editor_revisions(page_key,document,publication_version,created_by) values(p.page_key,p.document,p.version,s.decided_by);
   end if;
   update public.page_editor_work_items set status=case when s.status='scheduled' then 'active' else 'finished' end,applied_version=case when s.status='scheduled' then p.version else applied_version end where id=s.id;
  exception when others then update public.page_editor_work_items set status='failed',error=left(SQLERRM,180) where id=s.id;end;
 end loop;
end $$;
revoke all on function public.page_editor_audit_event() from public,anon,authenticated;
revoke all on function public.page_editor_workflow(text,jsonb) from public,anon,authenticated;
revoke all on function public.page_editor_review_get(text) from public,anon,authenticated;
revoke all on function public.page_editor_run_schedules() from public,anon,authenticated;
revoke all on function public.page_editor_publish(text,bigint) from public,anon;
grant execute on function public.page_editor_publish(text,bigint) to authenticated;
grant execute on function public.page_editor_workflow(text,jsonb) to authenticated;
grant execute on function public.page_editor_review_get(text) to anon,authenticated;
grant execute on function public.page_editor_run_schedules() to service_role;
commit;
