-- Run separately only after enabling Supabase Cron and validating the migration.
select cron.schedule('newkids-editor-schedules','* * * * *','select public.page_editor_run_schedules();');
