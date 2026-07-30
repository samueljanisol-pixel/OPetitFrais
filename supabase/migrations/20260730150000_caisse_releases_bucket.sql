-- Bucket privé pour installateur Electron caisse (URL signée via API token).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'caisse-releases',
  'caisse-releases',
  false,
  524288000,
  array[
    'application/octet-stream',
    'application/x-msdownload',
    'application/vnd.microsoft.portable-executable'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Accès réservé service role (pas de policy anon/authenticated).
