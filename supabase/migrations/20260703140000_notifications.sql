-- Notifications in-app + préférences + abonnements Web Push

create table if not exists public.user_notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  type_key text not null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, type_key)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type_key text not null,
  title text not null,
  body text not null,
  link_url text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_unread
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists idx_user_notifications_user_created
  on public.user_notifications (user_id, created_at desc);

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_push_subscriptions_user
  on public.user_push_subscriptions (user_id);

-- Helper : profils ayant une permission (inclut is_full_access)
create or replace function public.profiles_with_permission(p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.user_id
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where r.is_full_access
     or exists (
       select 1
       from public.role_permissions rp
       join public.permissions perm on perm.id = rp.permission_id
       where rp.role_id = r.id and perm.key = p_key
     );
$$;

grant execute on function public.profiles_with_permission(text) to service_role;

-- RLS
alter table public.user_notification_preferences enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_push_subscriptions enable row level security;

drop policy if exists "user_notification_preferences select own" on public.user_notification_preferences;
create policy "user_notification_preferences select own"
  on public.user_notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_notification_preferences insert own" on public.user_notification_preferences;
create policy "user_notification_preferences insert own"
  on public.user_notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_notification_preferences update own" on public.user_notification_preferences;
create policy "user_notification_preferences update own"
  on public.user_notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_notifications select own" on public.user_notifications;
create policy "user_notifications select own"
  on public.user_notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_notifications update own" on public.user_notifications;
create policy "user_notifications update own"
  on public.user_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_push_subscriptions select own" on public.user_push_subscriptions;
create policy "user_push_subscriptions select own"
  on public.user_push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_push_subscriptions insert own" on public.user_push_subscriptions;
create policy "user_push_subscriptions insert own"
  on public.user_push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_push_subscriptions delete own" on public.user_push_subscriptions;
create policy "user_push_subscriptions delete own"
  on public.user_push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

comment on table public.user_notification_preferences is 'Préférences de notification par utilisateur et par type.';
comment on table public.user_notifications is 'Notifications in-app (créées côté serveur via service role).';
comment on table public.user_push_subscriptions is 'Abonnements Web Push par utilisateur.';
