-- Lots existants sans date de livraison : lendemain calendaire (Africa/Casablanca) de created_at.
-- Propage la même date aux commandes déjà rattachées au lot.

update public.commande_fournisseur_lot
set date_livraison = (timezone('Africa/Casablanca', created_at))::date + 1
where date_livraison is null;

update public.commande_fournisseur cf
set date_livraison = l.date_livraison
from public.commande_fournisseur_lot l
where cf.lot_id = l.id
  and cf.date_livraison is null
  and l.date_livraison is not null;
