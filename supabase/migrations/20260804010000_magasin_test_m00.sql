-- Magasin test M00 : caisse magasin 0, commandes boutique test, hors sync CA FTP (dossier M00 ignoré).

insert into public.magasins (code, nom, sort_order, type)
select 'M00', 'Magasin test (caisse 0)', -1, 'magasin'
where not exists (
  select 1 from public.magasins where lower(trim(code)) = 'm00'
);
