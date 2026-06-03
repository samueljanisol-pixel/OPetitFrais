-- RPC analyse : exposer product_id et regrouper par produit catalogue quand lié

drop function if exists public.ca_analyse_product_lines(date, date, text[]);

create function public.ca_analyse_product_lines(
  p_from date,
  p_to date,
  p_magasins text[] default null
)
returns table (
  sale_date date,
  article text,
  product_id uuid,
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
    max(cpd.article)::text as article,
    cpd.product_id,
    cpd.magasin,
    sum(cpd.qty)::numeric as qty,
    sum(cpd.total)::numeric as total
  from public.ca_product_day cpd
  where cpd.date >= p_from
    and cpd.date <= p_to
    and (
      p_magasins is null
      or cardinality(p_magasins) = 0
      or cpd.magasin = any (p_magasins)
      or cpd.magasin = '__all__'
    )
  group by
    cpd.date,
    cpd.magasin,
    cpd.product_id,
    case when cpd.product_id is null then lower(trim(cpd.article)) else null end;
$$;

grant execute on function public.ca_analyse_product_lines(date, date, text[]) to authenticated;

comment on function public.ca_analyse_product_lines(date, date, text[]) is
  'Ventes produit par jour/magasin ; regroupement par product_id si lié, sinon par libellé caisse.';
