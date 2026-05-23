alter table public.profiles
  add column if not exists ui_locale text not null default 'fr';

alter table public.profiles
  drop constraint if exists profiles_ui_locale_check;

alter table public.profiles
  add constraint profiles_ui_locale_check check (ui_locale in ('fr', 'ar-MA'));

comment on column public.profiles.ui_locale is 'Langue UI backoffice : fr ou ar-MA (darija).';
