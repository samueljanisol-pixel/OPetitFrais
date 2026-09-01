-- date_cloture des achats comptables = date de livraison du lot (midi Africa/Casablanca),
-- et non l'horodatage d'enregistrement de la clôture.

update public.fournisseur_compte_achat a
set date_cloture = (l.date_livraison + time '12:00') at time zone 'Africa/Casablanca'
from public.commande_fournisseur_lot l
where a.lot_id = l.id
  and l.date_livraison is not null;

comment on column public.fournisseur_compte_achat.date_cloture is
  'Date de l''écriture : date de livraison du lot (pas l''horodatage de clôture).';
