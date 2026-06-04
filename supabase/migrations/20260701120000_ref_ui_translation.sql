-- Surcharges de traductions UI (next-intl) éditables depuis Paramètres

create table if not exists public.ref_ui_translation (
  message_key text not null,
  locale text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint ref_ui_translation_pkey primary key (message_key, locale),
  constraint ref_ui_translation_locale_check check (locale in ('fr', 'ar-MA'))
);

comment on table public.ref_ui_translation is
  'Surcharges des libellés i18n (clé pointée, ex. backoffice.home.products). Les JSON fr/ar-MA restent la source par défaut.';

create index if not exists idx_ref_ui_translation_locale
  on public.ref_ui_translation (locale);

alter table public.ref_ui_translation enable row level security;

drop policy if exists "ref_ui_translation select authenticated" on public.ref_ui_translation;
create policy "ref_ui_translation select authenticated"
  on public.ref_ui_translation for select
  to authenticated
  using (true);

drop policy if exists "ref_ui_translation write parametres" on public.ref_ui_translation;
create policy "ref_ui_translation write parametres"
  on public.ref_ui_translation for all
  to authenticated
  using (
    public.current_user_is_administrateur()
    or public.current_role_has_permission('parametres.write')
  )
  with check (
    public.current_user_is_administrateur()
    or public.current_role_has_permission('parametres.write')
  );

grant select, insert, update, delete on public.ref_ui_translation to authenticated;

drop trigger if exists trg_ref_ui_translation_updated on public.ref_ui_translation;
create trigger trg_ref_ui_translation_updated
  before update on public.ref_ui_translation
  for each row execute function public.commande_fournisseur_set_updated_at();
