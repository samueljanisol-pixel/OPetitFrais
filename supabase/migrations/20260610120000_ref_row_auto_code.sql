-- Code référentiel auto (6 chiffres) si non fourni à l’insert — aligné sur product_set_code.

create sequence if not exists public.ref_row_code_seq;

create or replace function public.ref_row_set_code()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := lpad((nextval('public.ref_row_code_seq'))::text, 6, '0');
  end if;
  return new;
end;
$$;

comment on function public.ref_row_set_code() is
  'Remplit code (unique par table) si NULL ou vide ; clé technique / exports, pas saisie utilisateur obligatoire.';

drop trigger if exists trg_ref_sales_unit_code on public.ref_sales_unit;
create trigger trg_ref_sales_unit_code
  before insert on public.ref_sales_unit
  for each row
  execute function public.ref_row_set_code();

drop trigger if exists trg_ref_category_code on public.ref_category;
create trigger trg_ref_category_code
  before insert on public.ref_category
  for each row
  execute function public.ref_row_set_code();

drop trigger if exists trg_ref_supplier_code on public.ref_supplier;
create trigger trg_ref_supplier_code
  before insert on public.ref_supplier
  for each row
  execute function public.ref_row_set_code();

drop trigger if exists trg_ref_conditionnement_code on public.ref_conditionnement;
create trigger trg_ref_conditionnement_code
  before insert on public.ref_conditionnement
  for each row
  execute function public.ref_row_set_code();

drop trigger if exists trg_ref_marchand_code on public.ref_marchand;
create trigger trg_ref_marchand_code
  before insert on public.ref_marchand
  for each row
  execute function public.ref_row_set_code();
