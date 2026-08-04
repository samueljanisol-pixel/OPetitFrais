-- Contenu du panier caisse au moment de l'encaissement (peut différer de la commande boutique).

alter table public.shop_cart_pos_link
  add column if not exists lines jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists sold_at timestamptz;

comment on column public.shop_cart_pos_link.lines is
  'Lignes encaissées à la caisse (snapshot au moment du ticket POS).';
comment on column public.shop_cart_pos_link.payments is
  'Modes de paiement POS au moment de l''encaissement.';
comment on column public.shop_cart_pos_link.sold_at is
  'Horodatage de vente côté caisse.';
