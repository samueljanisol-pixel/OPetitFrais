-- Fournisseur optionnel lié à un conditionnement (référentiel).

alter table public.ref_conditionnement
  add column if not exists supplier_id uuid references public.ref_supplier (id) on delete set null;

create index if not exists ref_conditionnement_supplier_id_idx
  on public.ref_conditionnement (supplier_id);
