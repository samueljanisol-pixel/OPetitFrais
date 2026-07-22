-- Tâches automatisées (import Sheet, synchro FTP, etc.)

create table if not exists public.automated_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text,
  enabled boolean not null default false,
  schedule_kind text not null default 'interval'
    check (schedule_kind in ('interval', 'daily')),
  interval_minutes int
    check (interval_minutes is null or interval_minutes >= 1),
  daily_time time,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint automated_tasks_schedule_check check (
    (schedule_kind = 'interval' and interval_minutes is not null)
    or (schedule_kind = 'daily' and daily_time is not null)
  )
);

create table if not exists public.automated_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.automated_tasks (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  message text,
  stats jsonb not null default '{}'::jsonb
);

create index if not exists automated_task_runs_task_started_idx
  on public.automated_task_runs (task_id, started_at desc);

create index if not exists automated_tasks_due_idx
  on public.automated_tasks (enabled, next_run_at)
  where enabled = true;

comment on table public.automated_tasks is
  'Registre des tâches planifiées (activation, période, config).';
comment on table public.automated_task_runs is
  'Historique d''exécution des tâches automatisées.';

-- Seed
insert into public.automated_tasks (
  code,
  label,
  description,
  enabled,
  schedule_kind,
  interval_minutes,
  config,
  next_run_at
)
values
  (
    'ftp_sync',
    'Synchronisation CA (FTP → Supabase)',
    'Importe les ventes depuis le FTP vers Supabase (ca_day, ca_month, etc.).',
    true,
    'interval',
    10,
    '{}'::jsonb,
    now()
  ),
  (
    'sheet_import',
    'Import produits (Google Sheet)',
    'Importe ou met à jour le catalogue produits depuis l''export Google Sheet.',
    false,
    'interval',
    60,
    '{"updateFields":"all"}'::jsonb,
    now()
  )
on conflict (code) do nothing;

alter table public.automated_tasks enable row level security;
alter table public.automated_task_runs enable row level security;

drop policy if exists "automated_tasks select sync or admin" on public.automated_tasks;
create policy "automated_tasks select sync or admin"
  on public.automated_tasks for select
  to authenticated
  using (
    public.current_user_is_administrateur()
    or public.current_role_has_permission('sync.run')
  );

drop policy if exists "automated_tasks update admin" on public.automated_tasks;
create policy "automated_tasks update admin"
  on public.automated_tasks for update
  to authenticated
  using (public.current_user_is_administrateur())
  with check (public.current_user_is_administrateur());

drop policy if exists "automated_task_runs select sync or admin" on public.automated_task_runs;
create policy "automated_task_runs select sync or admin"
  on public.automated_task_runs for select
  to authenticated
  using (
    public.current_user_is_administrateur()
    or public.current_role_has_permission('sync.run')
  );

-- Écriture runs : service role uniquement (pas de policy insert/update client)
