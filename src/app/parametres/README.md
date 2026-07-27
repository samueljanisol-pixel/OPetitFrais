# Paramètres

## Dialogues de formulaire (convention projet)

Toute fenêtre MUI **avec saisie** (TextField, Select, Checkbox, etc.) utilise **`FormDialog`** (`src/lib/mui/FormDialog.tsx`) : pas de fermeture au clic extérieur ni avec Échap. Les confirmations (supprimer, annuler) et l’affichage lecture seule gardent `Dialog` standard. Règle Cursor : [`.cursor/rules/Form-Dialog.mdc`](../../.cursor/rules/Form-Dialog.mdc).

Les fenêtres **Ajouter / Modifier** (référentiels, magasins, champs import planifié) suivent cette convention — uniquement via **Annuler** ou **Enregistrer**.

## Unités de vente

- Colonne **`label_ar`** (libellé arabe optionnel) sur `ref_sales_unit`. Saisie dans l’onglet **Unités de vente** (dialogue Ajouter / Modifier).
- Affichage arabe dans le **parcours commande** (boutons conditionnement : nom du colis + unité UdV du colis). Migration `20260702150000_ref_sales_unit_label_ar.sql`.

## Unités de commande

- Table **`ref_order_unit`** (UdC), distincte de l’UdV : utilisée pour les **commandes fournisseur** et l’import Google Sheet (colonne **UdC**).
- Onglet **Unités de commande** dans Paramètres (libellé + libellé arabe optionnel).
- Champ **`product.order_unit_id`** (optionnel) sur la fiche produit. Migration `20260722180000_ref_order_unit.sql`.

## Unités d'achat

- Table **`ref_purchase_unit`** (UdA), distincte de l’UdV et de l’UdC : unité dans laquelle le fournisseur facture / livre le produit.
- Onglet **Unités d'achat** dans Paramètres (libellé + libellé arabe optionnel).
- Champ **`product.purchase_unit_id`** (optionnel) sur la fiche produit. Import Google Sheet : colonne **UdA**. Migration `20260722190000_ref_purchase_unit.sql`.

## Unités de commande vitrine

- Table **`ref_shop_order_unit`** : unités proposées sur la boutique (`opetitfrais.ma`), distinctes de l’UdV / UdC / colis fournisseur.
- Chaque entrée = **libellé** (+ arabe) + **quantité de pièces** (`piece_qty`, ex. `0.25` = 1/4, `6` = lot de 6).
- Onglet **Unités commande vitrine** dans Paramètres (seul endroit pour créer / modifier).
- Sur la fiche produit : poids d’une pièce + cases (UdV en 1re ligne + unités du référentiel) + favori. Migration `20260727160000_shop_order_unit.sql`.

## Zone de livraison (boutique)

Onglet **Zone livraison** :

- Dessin du polygone sur carte (clics) → table `shop_delivery_zone`
- **Numéro boutique** (`ref_app_setting.shop_contact_phone`) pour Appeler / WhatsApp sur `/livraison`
- **Magasin retrait** (`ref_app_setting.shop_pickup_magasin_id`) — ex. Magasin 2

Adresses / GPS / lien Google Maps / **Visible vitrine** : fiches magasins (onglet Administration → Magasins & caisses).

Migration `20260727170000_shop_delivery_zone.sql`. API admin : `/api/admin/shop-delivery-zone`. Voir [`../shop/README.md`](../shop/README.md) et [`../livraison/README.md`](../livraison/README.md).

## Fournisseurs

- Colonne **`commande_active`** sur `ref_supplier` : interrupteur **Commande** dans l’onglet **Fournisseurs** (liste + dialogue Modifier).
- Si désactivé : le fournisseur n’apparaît plus en **saisie commande magasin** et aucune nouvelle commande ne peut être créée. Migration `20260703120000_ref_supplier_commande_active.sql`.

## Vendeurs

Les **vendeurs** (`ref_supplier_vendeur`) sont rattachés à un **fournisseur**. Chaque vendeur peut avoir :

- un **téléphone WhatsApp** (`phone`) — utilisé sur le récap commande lot prêt pour envoyer l’image + commentaire ;
- une **langue d’export commande** (`preferred_locale` : `fr` ou `ar-MA`) — l’image exportée (noms produit, en-têtes, UdV) est entièrement dans cette langue ;
- une **devise achat** (`devise_achat` : `dirham` ou `rial`, défaut `dirham`) — saisie des prix/totaux en Rial à l’achat si besoin (**1 DH = 20 Rial**) ; les montants lot restent stockés en **DH**. Migration `20260727140000_ref_supplier_vendeur_devise_achat.sql`.

Ils servent à la fois :

- à la configuration des **conditionnements produit** (cases « Vendeurs » dans les paramètres du colis) ;
- à l’**achat** (attribution des lignes de lot, frais, création / modification vendeur selon les droits).

Un même libellé peut exister chez plusieurs fournisseurs (enregistrements distincts).

## Conditionnements

- Colonne **`label_ar`** (libellé arabe optionnel) sur `ref_conditionnement`. Saisie dans l’onglet **Conditionnements** (dialogue Ajouter / Modifier).
- Migration : `20260630200000_ref_conditionnement_label_ar.sql`.

Migration : `20260619120000_unify_marchand_vendeur.sql` (fusion de l’ancien `ref_marchand`).

## Catégories et sous-catégories

- **`ref_category`** : catégories produit (onglet **Catégories**).
- Colonne **`label_ar`** (libellé arabe optionnel) sur `ref_category` et `ref_subcategory`. Saisie dans l’onglet **Catégories** (dialogues catégorie et sous-catégorie). Migration `20260702130000_ref_category_subcategory_label_ar.sql`.
- **Ordre d’affichage** : boutons monter / descendre sur chaque catégorie (`sort_order`). Cet ordre est repris sur la boutique publique (chips + sections) et ailleurs où les catégories sont triées par `sort_order`.
- **`ref_subcategory`** : sous-catégories rattachées à une catégorie (libellé unique par catégorie). Gestion dans le même onglet, tableau **Sous-catégories**.
- **`product.subcategory_id`** : optionnel ; doit correspondre à la catégorie du produit.
- Import Google Sheet : colonne **Sous-Catégorie** (création auto si absente). Migration `20260701160000_ref_subcategory.sql`.

## Charges Magasins

Onglet **Charges Magasins** : charges fixes par magasin et charges **générales** (sans magasin), utilisées pour le **bénéfice net estimé** dans `/ca` et `/historique-ca`.

- Composant : [`ChargesMagasinsAdminPanel.tsx`](ChargesMagasinsAdminPanel.tsx)
- Table `magasin_charge` (`magasin_id` null = générale, `label`, `quantite`, `prix`, `periodicite` `jour`|`mois`) — migration `20260727150000_magasin_charge.sql`
- API : `GET/POST /api/ref/magasin-charges`, `PATCH/DELETE /api/ref/magasin-charges/[id]`
- Total ligne = quantité × prix
- **Vue jour** : charge journalière = forfait ; charge mensuelle = forfait ÷ jours du mois
- **Vue mois** : charge mensuelle = 1 × forfait (même si mois incomplet) ; charge journalière × jours de la période
- Charges générales : soustraites uniquement des totaux globaux (pas réparties par magasin)
- Écriture : `parametres.write` ; lecture : `parametres.read` ou `ventes.read`

## Commandes fournisseur

Onglet **Commandes** : choix du **chauffeur** pour l’envoi WhatsApp depuis un lot prêt (export consolidation).

- Composant : [`ChauffeurAdminPanel.tsx`](ChauffeurAdminPanel.tsx)
- Table `ref_app_setting` — clé `chauffeur_user_id` (UUID `profiles.user_id`) — migration `20260725230000_profiles_phone_chauffeur_setting.sql`
- Téléphone du chauffeur : champ **`profiles.phone`** (saisie dans **Administration → Utilisateurs**)
- API : `GET/PATCH /api/ref/chauffeur`, `GET /api/ref/chauffeur/users` (liste pour le select)
- Écriture : permission `parametres.write` ; lecture chauffeur : consolidation ou paramètres

## Traductions (interface)

Onglet **Traductions** dans Paramètres : édition des libellés **par zone** (accueil, login, commandes, etc.) sans modifier les fichiers JSON du dépôt.

- Composant : [`TranslationsAdminPanel.tsx`](TranslationsAdminPanel.tsx)
- Catalogue des sections : [`src/lib/i18n/message-catalog.ts`](../../lib/i18n/message-catalog.ts)
- Table `ref_ui_translation` (`message_key`, `locale`, `value`) — migration `20260701120000_ref_ui_translation.sql`
- API : `GET/PATCH /api/ref/ui-translations` (sections, section, overrides)
- Une valeur identique au défaut JSON **supprime** la surcharge en base ; au chargement, les surcharges sont fusionnées dans les messages ([`src/i18n/request.ts`](../../i18n/request.ts) côté serveur, [`locale-client.tsx`](../../lib/i18n/locale-client.tsx) après enregistrement).

**Droits** : lecture pour tout utilisateur authentifié ; écriture = permission `parametres.write` ou administrateur (comme les autres référentiels).

## Tâches automatisées (administrateur)

Onglet **Tâches automatisées** visible uniquement pour le rôle **administrateur** (comme l’onglet Administration).

- Composant : [`AutomatedTasksAdminPanel.tsx`](AutomatedTasksAdminPanel.tsx)
- Tables : `automated_tasks`, `automated_task_runs` — migration `20260722140000_automated_tasks.sql`
- API admin : `GET/PATCH /api/admin/automated-tasks`, `POST …/[id]/run`, `GET …/[id]/runs`
- Cron Vercel : `GET/POST /api/automated-tasks/tick` (toutes les 5 min, secret `CRON_SECRET`)
- Tâches v1 :
  - **`ftp_sync`** — synchro CA FTP → Supabase (remplace le cron direct `/api/supabase/sync/run` dans `vercel.json`)
  - **`sheet_import`** — import catalogue depuis Google Sheet (service role, config `importFields` : champs cochés pour les produits existants). **Importé uniquement si le contenu export a changé** (empreinte SHA-256) depuis le dernier import réussi ; « Lancer maintenant » force l’import.

Les horaires **quotidiens** sont en **UTC**. L’historique et le statut footer CA lisent `automated_task_runs` en priorité (repli `sync_runs` pour FTP). Un run resté **En cours** plus de 20 minutes (timeout serverless, crash) est automatiquement marqué **Interrompu** au chargement de l’onglet, au tick cron ou au lancement manuel.
