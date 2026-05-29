-- Agrégation ventes produit sur période (page Analyse Stats)

create or replace function public.ca_analyse_product_lines(
  p_from date,
  p_to date,
  p_magasins text[] default null
)
returns table (
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
  group by cpd.article, cpd.magasin;
$$;

grant execute on function public.ca_analyse_product_lines(date, date, text[]) to authenticated;

comment on function public.ca_analyse_product_lines(date, date, text[]) is
  'Ventes produit agrégées sur une plage de dates, ventilées par magasin (hors legacy __all__).';
