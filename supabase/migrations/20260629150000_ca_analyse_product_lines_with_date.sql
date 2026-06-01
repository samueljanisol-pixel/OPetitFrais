-- Ventilation par jour pour le graphique Analyse Stats (CA / quantité)
-- Le type de retour change : DROP obligatoire avant recréation.

drop function if exists public.ca_analyse_product_lines(date, date, text[]);

create function public.ca_analyse_product_lines(
  p_from date,
  p_to date,
  p_magasins text[] default null
)
returns table (
  sale_date date,
  article text,
  magasin text,
  qty numeric,
  total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cpd.date as sale_date,
    cpd.article,
    cpd.magasin,
    sum(cpd.qty)::numeric as qty,
    sum(cpd.total)::numeric as total
  from public.ca_product_day cpd
  where cpd.date >= p_from
    and cpd.date <= p_to
    and cpd.magasin is distinct from '__all__'
    and (
      p_magasins is null
      or cardinality(p_magasins) = 0
      or cpd.magasin = any (p_magasins)
    )
  group by cpd.date, cpd.article, cpd.magasin;
$$;

grant execute on function public.ca_analyse_product_lines(date, date, text[]) to authenticated;

comment on function public.ca_analyse_product_lines(date, date, text[]) is
  'Ventes produit par jour, article et magasin sur une plage (hors legacy __all__).';
