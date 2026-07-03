-- Activer / désactiver les commandes fournisseur par fournisseur (référentiel Paramètres).
alter table public.ref_supplier
  add column if not exists commande_active boolean not null default true;

comment on column public.ref_supplier.commande_active is
  'Si false, le fournisseur n''apparaît pas en saisie commande magasin et aucune nouvelle commande ne peut être créée.';
