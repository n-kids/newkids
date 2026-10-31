alter table public.total_posts
  add column if not exists has_download_password boolean
  generated always as (coalesce(nullif(download_password, '') is not null, false)) stored;