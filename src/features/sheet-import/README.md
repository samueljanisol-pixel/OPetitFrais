# Import Google Sheet (transition)

## Colonnes lues (seules données importées)

`Actif`, `Code`, `Nom`, `Prix`, `Marge DH Actuelle` (alias « Marge DH »), `UdV`, `UdC` (unité de commande, optionnelle), `UdA` (unité d'achat, optionnelle), `Catégorie`, `SousCatégorie` (alias « Sous-Catégorie »), `Fournisseur`, `Marchand` (vendeur achat, rattaché au fournisseur de la ligne — **créé automatiquement** s’il n’existe pas), `Arabe` — voir `mapSheetRow.ts` (`SHEET_COLUMNS`).

Le proxy `/api/transition/sheet-json` utilise un timeout de 60 s (Apps Script peut être lent au cold start) et réessaie une fois en cas d’échec réseau.

## Export JSON BDD (équivalent Sheet)

`GET /api/transition/sheet-json-export` — mêmes données produit que l’export Sheet, clés :

`code`, `Actif`, `Nom`, `Prix`, `PrixAchat` (`product.cost_purchase`), `Fournisseur`, `Catégorie`, `SousCatégorie`, `Arabe`, `UdV`.

- **Sans connexion** : `GET /api/transition/sheet-json-export?token=…` — même token dans `SHEET_JSON_EXPORT_TOKEN` et `NEXT_PUBLIC_SHEET_JSON_EXPORT_TOKEN` (bouton **Export JSON (BDD)**).
- **Date dernière modif** (équivalent Google `?format=date`) : `GET /api/transition/sheet-json-export?format=date&token=…` → `{ "lastModified": "YYYYMMDDHHmmss" }` (`max(product.updated_at)`, fuseau Africa/Casablanca).
- Session `produits.read` : chemin sans token (secours).

## Import planifié (tâche automatisée)

L’import headless est disponible via la tâche **`sheet_import`** (Paramètres → **Tâches automatisées**, administrateur).

- Fetch Google : [`fetchSheetJsonFromGoogle.ts`](fetchSheetJsonFromGoogle.ts)
- Exécution : [`src/lib/automated-tasks/tasks/sheetImport.ts`](../lib/automated-tasks/tasks/sheetImport.ts) → `applySheetImport` avec **service role**
- Config : `importFields` — champs cochés pour les produits existants (`all` / `new_only` legacy en repli)
- **Planifié** : l’import ne s’exécute que si le JSON export a **changé** depuis le dernier import (hash SHA-256 stocké dans `automated_tasks.config.lastImportContentHash`). Un lancement manuel admin force l’import.

## Filtre d’import Sheet

Au clic sur **Importer depuis Google Sheet**, une fenêtre permet de **cocher les champs** éligibles pour les **produits existants** (mise à jour partielle). **Aucune case cochée par défaut** — sans case cochée, seuls les **nouveaux** produits (absents en base) sont créés. Pour un produit existant, seuls les champs **cochés et dont la valeur a changé** par rapport à la base sont écrits ; si aucune différence, la ligne est ignorée. Un **nouveau produit** est toujours créé avec **toutes** les colonnes lues. L’import traite les lignes en **parallèle** (mises à jour), insère les créations et l’historique prix par **lots**, et pré-crée vendeurs / sous-catégories manquants avant l’écriture produits.

## Import photos FTP

- POST `/api/products/import-photos-ftp` renvoie un flux **SSE** (`progress` / `done` / `error`) pour éviter les timeouts navigateur (~5 min d’import).
- Dossier FTP `img_produits/Photos_Produits.zip` ; fichiers nommés par code produit (ex. `12.jpg`).

## Export photos FTP

- POST `/api/products/export-photos-ftp` : sans body → construction ZIP côté serveur (SSE) ; avec `multipart/form-data` (`archive`) → dépôt du ZIP fourni par le client (mobile JSZip).
- Remplace `Photos_Produits.zip` sur le FTP. Images normalisées en JPG 100×100.

## Retrait du module

- **Désactiver l’UI** : `SHEET_IMPORT_ENABLED = false` dans `config.ts`.
- **Retirer du projet** : supprimer
  - `src/app/api/transition/` (route proxy JSON),
  - dans `ProduitsListClient.tsx` l’import et le composant `SheetImportBar`.
