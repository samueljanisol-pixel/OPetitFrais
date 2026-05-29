-- Valeur par défaut sur magasin (évite NOT NULL si colonne omise lors d'un upsert legacy)

update public.ca_product_day
set magasin = '__all__'
where magasin is null;

alter table public.ca_product_day
  alter column magasin set default '__all__';

alter table public.ca_product_day
  alter column magasin set not null;
