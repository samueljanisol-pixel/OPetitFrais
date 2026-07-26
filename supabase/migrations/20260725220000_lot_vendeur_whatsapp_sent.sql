-- Marquage « WhatsApp envoyé » par vendeur sur un lot consolidé (récap lot prêt).

alter table public.commande_fournisseur_lot_vendeur_comment
  add column if not exists whatsapp_sent_at timestamptz;
