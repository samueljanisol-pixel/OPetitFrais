-- Activation caissier POS (indépendant du rôle RBAC) + hash du code numérique.
-- Le PIN n'est jamais stocké en clair.

alter table public.profiles
  add column if not exists is_caissier boolean not null default false;

alter table public.profiles
  add column if not exists caisse_pin_hash text;

comment on column public.profiles.is_caissier is
  'Utilisateur autorisé à ouvrir une caisse Electron (liste locale hors ligne).';

comment on column public.profiles.caisse_pin_hash is
  'Hash scrypt du code numérique caisse (4-8 chiffres). Jamais le PIN en clair.';
