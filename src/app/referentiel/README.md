# Paramètres (référentiels)

## Unités de vente

- Colonne **`label_ar`** (libellé arabe optionnel) sur `ref_sales_unit`. Saisie dans l’onglet **Unités de vente** (dialogue Ajouter / Modifier).
- Affichage arabe dans le **parcours commande** (boutons conditionnement : nom du colis + unité UdV du colis). Migration `20260702150000_ref_sales_unit_label_ar.sql`.

## Vendeurs

Les **vendeurs** (`ref_supplier_vendeur`) sont rattachés à un **fournisseur**. Ils servent à la fois :

- à la configuration des **conditionnements produit** (cases « Vendeurs » dans les paramètres du colis) ;
- à l’**achat** (attribution des lignes de lot, frais, renommage selon les droits).

Un même libellé peut exister chez plusieurs fournisseurs (enregistrements distincts).

## Conditionnements

- Colonne **`label_ar`** (libellé arabe optionnel) sur `ref_conditionnement`. Saisie dans l’onglet **Conditionnements** (dialogue Ajouter / Modifier).
- Migration : `20260630200000_ref_conditionnement_label_ar.sql`.

Migration : `20260619120000_unify_marchand_vendeur.sql` (fusion de l’ancien `ref_marchand`).

## Catégories et sous-catégories

- **`ref_category`** : catégories produit (onglet **Catégories**).
- Colonne **`label_ar`** (libellé arabe optionnel) sur `ref_category` et `ref_subcategory`. Saisie dans l’onglet **Catégories** (dialogues catégorie et sous-catégorie). Migration `20260702130000_ref_category_subcategory_label_ar.sql`.
- **`ref_subcategory`** : sous-catégories rattachées à une catégorie (libellé unique par catégorie). Gestion dans le même onglet, tableau **Sous-catégories**.
- **`product.subcategory_id`** : optionnel ; doit correspondre à la catégorie du produit.
- Import Google Sheet : colonne **Sous-Catégorie** (création auto si absente). Migration `20260701160000_ref_subcategory.sql`.

## Traductions (interface)

Onglet **Traductions** dans Paramètres : édition des libellés **par zone** (accueil, login, commandes, etc.) sans modifier les fichiers JSON du dépôt.

- Composant : [`TranslationsAdminPanel.tsx`](TranslationsAdminPanel.tsx)
- Catalogue des sections : [`src/lib/i18n/message-catalog.ts`](../../lib/i18n/message-catalog.ts)
- Table `ref_ui_translation` (`message_key`, `locale`, `value`) — migration `20260701120000_ref_ui_translation.sql`
- API : `GET/PATCH /api/ref/ui-translations` (sections, section, overrides)
- Une valeur identique au défaut JSON **supprime** la surcharge en base ; au chargement, les surcharges sont fusionnées dans les messages ([`src/i18n/request.ts`](../../i18n/request.ts) côté serveur, [`locale-client.tsx`](../../lib/i18n/locale-client.tsx) après enregistrement).

**Droits** : lecture pour tout utilisateur authentifié ; écriture = permission `parametres.write` ou administrateur (comme les autres référentiels).
