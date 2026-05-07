-- Quantités décimales (max 2 décimales côté appl.) : lignes commande, répartition magasins lots, lignes lots achat

alter table public.commande_fournisseur_ligne
  alter column qte type numeric(14, 2)
  using (qte::numeric);

alter table public.commande_fournisseur_lot_ligne_magasin
  alter column qte type numeric(14, 2)
  using (qte::numeric);

alter table public.commande_fournisseur_lot_ligne
  alter column qte_achat type numeric(14, 2)
  using (case when qte_achat is null then null else qte_achat::numeric end);

alter table public.commande_fournisseur_lot_ligne
  alter column qte_besoin_fige type numeric(14, 2)
  using (case when qte_besoin_fige is null then null else qte_besoin_fige::numeric end);
