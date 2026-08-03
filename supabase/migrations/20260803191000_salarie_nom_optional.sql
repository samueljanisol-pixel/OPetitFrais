-- Nom salarié optionnel (seul le prénom est obligatoire)

alter table public.salarie alter column nom drop not null;

comment on column public.salarie.nom is 'Nom de famille (optionnel).';
