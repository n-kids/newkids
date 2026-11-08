-- Run only on a disposable database after the migration. This is not an end-to-end test.
begin;
do $$
begin
 if has_function_privilege('anon','public.page_editor_workflow(text,jsonb)','EXECUTE') then raise exception 'anon workflow privilege leak';end if;
 if has_function_privilege('authenticated','public.page_editor_run_schedules()','EXECUTE') then raise exception 'authenticated scheduler privilege leak';end if;
 if not has_function_privilege('anon','public.page_editor_review_get(text)','EXECUTE') then raise exception 'review lookup unavailable';end if;
 if has_table_privilege('anon','public.page_editor_work_items','SELECT') then raise exception 'anon work item table access';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('page_editor_work_items','page_editor_audit') and not c.relrowsecurity) then raise exception 'RLS not enabled';end if;
end $$;
rollback;
