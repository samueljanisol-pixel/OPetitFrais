# Caisse magasin — Electron (Phase 1)

Application caisse Windows **1024×768** + écran client **plein écran sur le 2ᵉ moniteur** (si présent), inspirée WinDev.

Fenêtres **sans barre de titre ni menu** (mode kiosque Electron). Fermeture : **Menu → Fermer caisse**, **Alt+F4** ou clic droit sur l’icône barre des tâches — **confirmation demandée** dans tous les cas.

**Écran client** : ouvert uniquement s'il existe un second écran (autre que le principal). Sinon, seule la fenêtre caissier s'affiche.

## Prérequis

- Node.js 20+
- Agent local (`@opf/caisse-agent`) sur le port **4711**

## Développement

```bash
# Terminal 1 — agent (balance mock + impression)
npm run dev:caisse-agent

# Terminal 2 — caisse Electron
npm run dev:caisse
```

## Installation sur un poste magasin (premier essai)

### 1. Créer l’installateur (sur la machine de dev)

```powershell
cd D:\Cursor\o-petit-frais
npm install
npm run dist:caisse
```

Fichier produit : `apps/caisse/dist-win/OPetitFrais-Caisse-Setup-{version}.exe` (ex. `OPetitFrais-Caisse-Setup-0.1.4.exe`, version = `apps/caisse/package.json`).

Fermez la caisse (`npm run preview`) et l’explorateur Windows sur ce dossier avant de relancer `npm run dist:caisse`.

### 2. Publier pour téléchargement sécurisé

**Option A — backoffice local** (essai rapide, backoffice `npm run dev` sur le PC de dev) :

Copier le lien (remplacer le token par celui de `.env.local` → `CAISSE_TICKET_TOKEN`) :

```
http://localhost:3000/api/caisse/release/download?token=VOTRE_TOKEN
```

Ouvrir ce lien **sur le poste caisse** (même réseau LAN que le PC de dev).

**Option B — production** (backoffice déployé + FTP Janisol) :

```powershell
npm run upload:caisse-release
```

Prérequis : variables `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` dans `.env.local` (même FTP que la sync photos). L’installateur est déposé dans `/POS/OPetitFrais-Caisse-Setup-{version}.exe` (nom dérivé de la version caisse).

Lien sur le poste magasin :

```
https://opetitfrais.janisol.ma/api/caisse/release/download?token=VOTRE_TOKEN
```

Le token est le même secret que pour le catalogue (`CAISSE_TICKET_TOKEN` côté serveur ; `caisseToken` dans `caisse.config.json` sur le poste).

### 3. Agent local (intégré depuis 0.1.7)

L’installateur caisse **inclut l’agent** balance/impression (port **4711**) — **Node.js n’est plus requis** sur le poste magasin.

En développement, vous pouvez toujours lancer l’agent séparément :

```powershell
npm run dev:caisse-agent
```

Si le port 4711 est déjà pris (agent externe), la caisse s’y connecte automatiquement.

### 4. Configuration du poste (premier lancement)

Au **premier démarrage**, si `caisse.config.json` est incomplet, une fenêtre de configuration s’affiche **à la place de la caisse** :

| Champ | Règle |
|-------|--------|
| URL backoffice | Ex. `https://opetitfrais.janisol.ma` |
| Token caisse | Même secret que `CAISSE_TICKET_TOKEN` |
| Numéro magasin | `0` = mode test (hors statistiques) |
| Numéro caisse | Entier **> 0**, unique par magasin |

Chaque poste reçoit un **`posteId`** (UUID) enregistré côté serveur (`POST /api/caisse/poste/register`). Deux postes ne peuvent pas partager le même numéro de caisse pour un magasin donné.

Fichier prod : `%APPDATA%\OPetitFrais Caisse\caisse.config.json` (créé automatiquement à la validation).

Exemple complet — voir `caisse.config.example.json` :

```json
{
  "backofficeUrl": "https://opetitfrais.janisol.ma",
  "caisseToken": "MÊME_TOKEN_QUE_CAISSSE_TICKET_TOKEN",
  "magasinCode": "01",
  "caisseCode": "01",
  "posteId": "uuid-généré-automatiquement",
  "scalePort": "COM9",
  "saurusScaleIp": "192.168.0.87",
  "ticketPrinter": "Nom imprimante ticket"
}
```

Les paramètres matériels (balance, imprimante) restent modifiables via **Menu → Paramètres** une fois la caisse ouverte.

### 5. Mises à jour automatiques

En bas à gauche de la caisse (barre d’état, 2 lignes) :

- **Ligne du haut** : voyants **Internet**, **Serveur API**, **balance SAURUS**
- **Ligne du bas** : version + statut MAJ (à gauche) · **date/heure** (gras, à droite)

| Affichage | Signification |
|-----------|----------------|
| `v0.1.0` | Version installée — **cliquer** pour vérifier manuellement les mises à jour |
| `v0.1.0 · À jour` | Dernière version (retour 3 s après vérification manuelle) |
| `v0.1.0 · MAJ 42%` | Téléchargement en cours |
| `v0.1.0 · MAJ prête` | Installateur téléchargé — **cliquer** sur « MAJ prête » pour installer et redémarrer |

**Fonctionnement (poste packagé uniquement)** :

1. Au démarrage puis toutes les 4 h, la caisse interroge `GET /api/caisse/release?token=…` (**avant** toute proposition d’install du cache TEMP)
2. Si la version serveur est plus récente → téléchargement automatique (~83 Mo) en arrière-plan (`OPetitFrais-Caisse-Setup-{version}.exe`) ; un cache plus ancien est abandonné
3. **Au lancement**, si la dernière MAJ est téléchargée → dialogue **« Mise à jour disponible »** (**Plus tard** / **Installer**) avant l’ouverture de la caisse
4. Clic sur **« MAJ prête »** / **Installer** → **nouvelle vérification serveur** ; si une version encore plus récente existe → retéléchargement, sinon écran **« Mise à jour en cours »** puis **fenêtre NSIS one-click** (progression visible, sans pages Suivant/Installer)
5. Fermeture de la caisse pour libérer les fichiers, puis **relance automatique** après la fin de l’installateur
6. Si la version installée ≥ version serveur → badge « À jour » (le cache TEMP est purgé ; plus de « MAJ prête » fantôme)

En cas d’échec (caisse se ferme sans installation, ou **NSIS Error : installer integrity check has failed**) :

1. Supprimer le fichier corrompu : `%TEMP%\OPetitFrais-Caisse-Setup-{version}.exe`, `*.part` et `%TEMP%\opf-caisse-update.json`
2. Relancer la caisse — elle retéléchargera l’installateur (taille + SHA-256 + signature NSIS)
3. Même taille ≠ fichier sain : un téléchargement concurrent peut corrompre le contenu (même octet count). Comparer : `node scripts/compare-caisse-installer.mjs 0.1.10` → `Hash identique: true`
4. Consulter `%APPDATA%\OPetitFrais Caisse\caisse-update.log` pour le détail

Correctifs téléchargement (à publier en 0.1.11+) : écriture atomique (`.part` puis rename), verrou anti-course, et vérification `sha256` renvoyée par `/api/caisse/release` (sidecar FTP `*.exe.sha256`).

Cause fréquente : **téléchargement incomplet** via le proxy API/Vercel (~83 Mo attendus). Configurer `CAISSE_RELEASE_PUBLIC_BASE_URL` sur Vercel (ex. `https://opetitfrais.janisol.ma/POS`) ou redéployer le backoffice avec la correction FTP (fichier complet avant envoi). La caisse rejette un exe dont la taille ne correspond pas à celle annoncée par l’API ou sans signature NSIS valide.

**Publier une nouvelle version** (une seule commande) :

```powershell
npm run release:caisse -- patch   # ferme caisse/preview, bump, build, upload FTP
```
npm run release:caisse -- minor   # 0.1.0 → 0.2.0
npm run release:caisse -- 0.2.0   # version explicite
npm run release:caisse            # sans bump (rebuild + upload version actuelle)
```

La version servie par l’API (`GET /api/caisse/release`) est lue depuis **`apps/caisse/package.json`** (plus besoin de `CAISSE_RELEASE_VERSION` sur Vercel). Commit + push après release pour aligner le backoffice déployé.

## Structure

| Dossier | Rôle |
|---------|------|
| `build/icon-source.png` | Logo pomme (source icône app) |
| `build/icon.png` | Icône Windows fond transparent (généré) |
| `electron/main` | Fenêtres caissier + client, IPC |
| `electron/preload` | Pont sécurisé renderer ↔ main |
| `src/screens/CashierGate.tsx` | Blocage caisse si config identité incomplète |
| `src/components/CaisseVersionBadge.tsx` | Version + progression MAJ (bas gauche) |
| `electron/main/caisse-update.ts` | Téléchargement / installation installateur |
| `src/screens/CashierScreen.tsx` | UI principale caisse |
| `src/screens/CustomerScreen.tsx` | Affichage client |
| `src/components/LastPaymentSummaryCard.tsx` | Rappel dernier paiement (zone panier) |
| `src/components/PaymentDialog.tsx` | Modal paiement (monnaie visuelle, modes avec icônes) |
| `src/components/CashMonnaieGrid.tsx` | Grille billets/pièces (disposition caisse) |
| `src/lib/payment-monnaie.ts` | Images billets/pièces, disposition grille et modes de paiement |
| `src/components/ClientSelectDialog.tsx` | Sélection / liste clients |
| `src/components/MenuDialog.tsx` | Menu caisse (actualiser prix, réimprimer ticket, paramètres) |
| `src/lib/last-ticket.ts` | Dernier ticket ESC/POS (localStorage) pour réimpression |
| `src/components/SettingsDialog.tsx` | Paramètres balance COM, IP SAURUS, imprimante ticket |
| `electron/main/saurus-scale/` | Protocole UDP LB1 (catalogue PLU) |
| `src/lib/hardware-config.ts` | Lecture / enregistrement config matérielle |
| `src/components/VignetteProductName.tsx` | Nom produit vignette — taille auto sans ellipsis |
| `src/components/ProductQtyDialog.tsx` | Saisie quantité / poids (ajout appui long ou modification ligne panier), boutons **+** / **−** |
| `src/components/RoundNumpad.tsx` | Clavier numérique rond réutilisable |
| `src/components/RoundActionButton.tsx` | Bouton rond d'action (colonne à droite du clavier) |
| `src/components/AlphaKeyboard.tsx` | Clavier alphabétique tactile |
| `src/lib/clients.ts` | Sync clients via API backoffice |

## Logique métier

Package partagé [`@opf/caisse-core`](../../packages/caisse-core) :

- Panier, ajout produit (kg / unité, Imprimer Prix)
- Fusion automatique des lignes identiques (même produit → quantités additionnées)
- Tickets ESC/POS vente (modèle WinDev : colonnes Produit/Qté/Prix/Total, catégories, pied magasin/paiement) + étiquette prix

## Phase 1 (MVP)

- [x] Layout caissier + client
- [x] Grille produits (catalogue Supabase via API)
- [x] Import catalogue via `/api/caisse/catalog`
- [x] Clavier code + balance (SSE ~50 ms)
- [x] Imprimer Prix (étiquette via agent)
- [x] Paiement (modal)
- [x] Clients (liste, ajout, modification, association au panier)
- [x] Lignes panier compactes — sélection pour modifier poids/prix ou supprimer
- [x] Bip succès à l'ajout produit (`Bip_Valide.wav` WinDev) / bip synthétique erreur
- [x] Panier groupé par catégorie + cache local (restauration après crash)
- [x] **Mode hors ligne** : catalogue et clients depuis le dernier cache si internet ou serveur indisponible ; ventes, tickets et balance SAURUS restent utilisables
- [x] Paniers en attente (mise en attente, rappel, persistance locale)
- [x] Annulation des ajouts (pile LIFO, bouton rond à droite du clavier)
- [x] **Commandes boutique** — Menu → liste commandes `a_passer_caisse`, verrou poste, client seul au panier, double impression ticket, lien POS
- [ ] Sync Supabase / catalogue réel (Phase 2)
- [ ] Parseur scan code-barres (plus tard)
- [ ] Auth caissier

## Config poste (futur)

`%ProgramData%\OPetitFrais\config.json` — magasin, caisse, ports COM.

## Import catalogue Supabase

Au démarrage, le catalogue est **préchargé** côté Electron (réseau puis cache disque `%AppData%/OPetitFrais/catalog-cache.json`). La grille produits s’affiche dès que le cache est disponible.

**Hors ligne** : si internet ou le serveur backoffice est inaccessible, la caisse charge le **dernier catalogue en cache** (date affichée dans le bandeau orange). Les ventes, tickets, balance locale et envoi SAURUS restent possibles. Indisponibles : commandes boutique, création/modification clients, actualisation des prix.

Le **catalogue** est persisté dans `%AppData%/OPetitFrais/catalog-cache.json` ; la **liste clients** dans `clients-cache.json` (plus miroir `localStorage` côté renderer). Les deux sont préchargés au démarrage Electron.

Menu → **Actualiser les prix** force un rechargement réseau ; en cas d’échec, le cache précédent est conservé.

Sans token et sans cache, la grille reste vide et un message d’erreur s’affiche.

Onglets catégories (ordre fixe) : **Légume**, **Fruit**, **Frigo**, **Herbes**, **Epice**, **Divers** — puis les autres catégories éventuelles.

Grille produits : **8×6 par page** (48 produits), navigation **Page précédente / suivante** — pas de défilement vertical. Nom produit en bas de vignette : police **réduite automatiquement** pour afficher tout le libellé (sans « … »). **Appui long** sur une vignette ou **clic sur une ligne panier** : même dialogue `ProductQtyDialog` (photo, clavier, **+** / **−** pour le signe, prix modifiable en édition).

Colonne droite (panier, balance, clavier) : **300 px** de large. **Total panier** arrondi au **0,5 DH** le plus proche (`roundMoneyHalf` dans `@opf/caisse-core`).

Fichier **`apps/caisse/caisse.config.json`** (copier depuis `caisse.config.example.json`) :

```json
{
  "backofficeUrl": "http://localhost:3000",
  "scalePort": "COM9",
  "magasinCode": "00",
  "caisseCode": "01"
}
```

Le **token** est lu automatiquement depuis `.env.local` à la racine (`CAISSE_TICKET_TOKEN`). Pas besoin de rebuild pour changer la config.

Au démarrage, la caisse appelle `GET /api/caisse/catalog`. Bouton **↻** pour actualiser.

## Clients

Bouton **Client** : liste des clients actifs, création et modification (FormDialog).

- `GET /api/caisse/clients?token=…` — liste
- `POST /api/caisse/clients?token=…` — création `{ name, phone?, email?, notes? }`
- `PATCH /api/caisse/clients/[id]?token=…` — modification

Table Supabase `caisse_client` (réseau commun). Client système seed : **1 - LIVRAISON**.

Le client sélectionné est associé au panier ; obligatoire pour le mode paiement **Crédit**. Après **validation du paiement** ou **suppression du panier**, le client est **réinitialisé** (sans client).

## Commandes boutique

Menu → **Commandes boutique** : liste des commandes `a_passer_caisse` pour le magasin/caisse configurés.

**Prérequis backoffice** : les routes `/api/caisse/commandes-boutique/*` doivent être déployées sur l’URL configurée dans `caisse.config.json`. En local : `http://localhost:3000` avec `npm run dev`. En prod : déployer la version du monorepo incluant le module commandes client. Si l’API n’est pas encore en ligne, la caisse affiche une erreur explicite (404) au lieu de « Réseau indisponible ».

### Mode test (magasin 0)

| Poste caisse | Magasin backoffice commande |
|--------------|----------------------------|
| **0** (config caisse → `00`) | **M00** — *Magasin test* (à la validation) |

- Caisse **magasin 0** : les ventes ne comptent pas dans les statistiques CA ; tickets **M00CxxTxxx** ; dossier FTP **M00** ignoré par la sync.
- Liste **Commandes boutique** en magasin 0 : **toutes** les commandes `a_passer_caisse` (tous magasins), pour tester le flux caisse sans filtrer.
- Pour limiter aux seules commandes test : valider la commande avec le magasin **M00** uniquement.

Parcours test complet :

1. Backoffice : commande boutique → validation → magasin **M00** → préparation → `a_passer_caisse`.
2. Caisse : magasin **0**, caisse **1** (ou autre).
3. Menu → **Commandes boutique** → ouvrir la commande → encaissement test (double ticket).
4. Aucun impact sur le CA des vrais magasins (M01, M02…).

1. **Verrou** poste (30 min) — une commande = un caissier à la fois.
2. Chargement : **client seul** sur le panier (lignes vides) ; badge **Commande #N** visible.
3. Le caissier pèse et encaisse normalement.
4. **Double impression** obligatoire (ticket vente + ticket commande boutique) — pas de « Valider sans ticket ».
5. Crédit client **pré-rempli** mais modifiable ; switch **Livraison** activé si commande livraison.
6. À la validation : lien API `shop_cart_pos_link` + passage statut `livraison` / `retrait`.

### À encaisser (espèce / impayé livraison)

Deuxième liste dans **Commandes boutique** — commandes déjà passées en caisse dont le paiement est encore dû :

- `livre_espece_a_encaisser` / `retire_espece_a_encaisser` (espèce confirmée à la livraison/retrait)
- `livre_non_paye` (livraison sans paiement)

Clic → ouverture directe du **modal Paiement** (montant = total caisse `pos_total`), client pré-sélectionné, badge **Encaissement #N**. Validation → API `collect-payment` + ticket de caisse (ligne « Commande #N »).

Si un **panier est déjà en cours** (lignes ou client sélectionné), un dialogue propose de **continuer le panier** ou de le **mettre en attente** avant l’encaissement.

Fichiers : `src/lib/commandes-boutique.ts`, `src/components/CommandesBoutiqueDialog.tsx`, `PaymentDialog` (`linkedShopOrder`).

## Paiement

Modal **Paiement** : fenêtre large (`md`), hauteur ~**viewport − 48 px**. Bandeau **Total Panier** en haut. Disposition **2 colonnes** — modes, monnaie et liste à gauche ; **clavier rond à droite, ancré en bas**. Total / Monnaie au-dessus des boutons d’action.

- **Clic sur un mode** : ajoute le **reste à payer** (ou le total du panier si rien n'est encore encaissé). S'il ne reste rien à payer, une ligne à **0 DH** est créée ou sélectionnée pour saisie manuelle au clavier.
- **Espèces** : grille billets/pièces ; chaque clic additionne avec le **détail des monnaies** en petit. Re-clic sur le bouton **Espèces** : **remplace** la ligne (efface le détail) avec le total panier ou le reste à payer.
- **Clavier rond** : saisie libre sur le mode actif. Ligne sélectionnée : montant affiché au clavier ; **1ʳᵉ touche = nouvelle saisie** ; **OK remplace** la ligne puis **efface** le clavier.
- Chaque ligne peut être retirée individuellement (×). Total paiement et monnaie à rendre en bas.
- Après validation du paiement, un encart **Dernier ticket** rappelle **date/heure**, total panier, encaissé, mode(s) de paiement et monnaie rendue ; il disparaît dès qu’un produit est ajouté au panier.

## Ticket de caisse (ESC/POS 80 mm)

Modèle aligné sur le ticket WinDev (`ticket2.pdf`) — **Font B 64 colonnes**, code page **CP1252** :

1. **En-tête** — titre magasin centré, ligne magasin/caisse, colonnes **Produit | Qté | Prix | Total** en gras, trait séparateur.
2. **Corps** — blocs par **catégorie** (`--- Légume ---` centré), lignes produit en majuscules (retour à la ligne si nom long).
3. **Pied** — date/heure, paiements, **Magasin / Caisse / No Ticket**, **code-barres** pleine largeur (réf. sous les barres), messages de remerciement alignés à gauche.

En-tête ticket : **logo O'petit frais** (raster ESC/POS). Regénérer le logo : `npm run generate:logo -w @opf/caisse-core`.

Montants avec **virgule** décimale (`12,50`). Génération : `buildSaleTicketEscPos` dans `@opf/caisse-core`.

## Étiquette prix (mode Imprimer prix)

Modèle ESC/POS **80 mm × 40 cm** (mode page) — **coupe papier** après avance :

1. **Haut** — nom produit sur **toute la largeur** (64 col., gras, double hauteur, aligné à gauche).
2. **Sous le nom** — prix en **gros** : partie entière + virgule en double largeur/hauteur, centimes en plus petit.
3. **Bas** — **logo** en bas à gauche ; à droite du logo : **Prix au Kg** ou **Prix à l'unité** (accents CP1252).

Pas de traits séparateurs ni de pied « O'petit frais » (le logo suffit).

Génération : `buildPriceLabelEscPos` dans `@opf/caisse-core`. Le nom imprimé suit la locale affichée (FR/AR) ; caractères non ASCII remplacés pour l’imprimante thermique.

**Impression** : à la validation du paiement (**avec ou sans ticket**), la caisse envoie d’abord **`ESC p 0`** (ouverture tiroir, comme WinDev `iEscape(ESC+"p0")`), puis le ticket si demandé. L’imprimante ticket doit être configurée dans **Menu → Paramètres** (tiroir connecté à l’imprimante). En cas d’échec d’impression, le ticket reste disponible via **Imprimer dernier ticket**.

## Clavier code et actions rapides

Le clavier numérique rond accepte une **`sideColumn`** optionnelle (4ᵉ colonne) : sur l’écran caissier — **retour**, **paiement** (double hauteur en bas). **Supprimer panier** est à droite du bouton Attente.

- **Annuler dernier produit** (↶ orange) : retire le dernier ajout selon une **pile LIFO** (ordre inverse des ajouts). Chaque clic annule un ajout ; le bouton reste actif tant qu'il reste des entrées dans l'historique.
- **Supprimer le panier** (poubelle rouge) : ouvre la confirmation de vidage du panier.
- La ligne du dernier ajout reste surlignée en vert dans le panier.
- L'historique est vidé au paiement, à la suppression du panier, à la mise en attente ou au rappel d'un panier en attente. Une modification manuelle d'une ligne retire ses entrées d'historique.

## Menu caisse

Bouton **Menu** (colonne droite) :

- **Actualiser les prix** — recharge le catalogue depuis Supabase (`/api/caisse/catalog`).
- **Envoyer prix balance SAURUS** — envoi UDP du catalogue PLU vers la balance réseau (LB1, port 5001).
- **Imprimer dernier ticket** — réimprime le dernier ticket de vente (activé après un paiement avec impression) ; date/heure du ticket affichée en petit sous le bouton.
- **Paramètres** — port **COM** balance, **IP balance SAURUS**, **imprimante ticket** (`caisse.config.json`).
- **Fermer caisse** — quitte l’application Electron (confirmation demandée).

Colonne droite (panier) : logo **O'petit frais** sur fond blanc + bouton **Menu** en haut à droite ; **Client**, **Attente**, **Supprimer panier** (icône) ; clavier avec colonne **Retour** + **Paiement**.

Barre du bas (colonne produits) : **voyants + version/date** à gauche, **pagination** au centre, **switches sur 2 lignes** à droite (`1-9/A-Z` + `FR/AR`, puis `Imprimer prix`) — hauteur compacte d’origine. En mode **AR**, les libellés arabes sont affichés en **police plus grande** sur les catégories (17 px), vignettes (14 px max) et panier (13 px) ; sous-catégories identiques au FR (14 px, même police et gras). **Balance** + bouton **T** à droite de la rangée catégories — poids en police **7 segments** (`formatBalanceWeightKgFrFixed` : **2 décimales** si &lt; 0, **3 décimales** de 0 à 10 kg, **2 décimales** ≥ 10 kg, **zéros affichés**), fond **rouge** si poids négatif, **Kg** fixe à droite.

La config matérielle est persistée dans `caisse.config.json` (userData Electron en prod) et synchronisée avec l’agent via `POST /config/hardware`. Chaque impression envoie aussi le nom d’imprimante choisi dans les paramètres. Changer le port COM reconnecte la balance automatiquement.

## Balance USB

### Dépannage — port COM invisible dans Paramètres

| Symptôme | Cause | Action |
|----------|--------|--------|
| Liste COM vide | Agent intégré non démarré (bug ou redémarrage nécessaire) | Redémarrer la caisse ; vérifier `curl http://127.0.0.1:4711/health` |
| Balance reste à 0 | Mauvais port COM ou Arduino occupé | Choisir le bon COM ; fermer Moniteur série Arduino |

**Vérifier l’agent sur le poste magasin :**

```powershell
curl.exe -s http://127.0.0.1:4711/health
curl.exe -s http://127.0.0.1:4711/serial/ports
```

Si `health` échoue → redémarrer la caisse (0.1.7+) ou lancer `npm run dev:caisse-agent` en dev.

**Contournement immédiat** — éditer `%APPDATA%\OPetitFrais Caisse\caisse.config.json` :

```json
"scalePort": "COM3"
```

(remplacer par le numéro vu dans le Gestionnaire de périphériques), puis démarrer l’agent.

L’agent détecte automatiquement le port **CH340** (wch.cn) ou lit `scalePort` dans `caisse.config.json`. Variable d’environnement `OPF_SCALE_PORT` prioritaire si définie.

## Balance SAURUS (réseau)

Balance étiqueteuse **LB1** en UDP port **5001** (protocole reverse-engineer, voir `scale-sniffer/PROTOCOL.md`).

- **Paramètres** : champ `saurusScaleIp` (ex. `192.168.0.87`) dans `caisse.config.json`
- **Menu** : **Envoyer prix balance SAURUS** — catalogue en cache (produits actifs, PLU = chiffres du code produit)
- Implémentation : `electron/main/saurus-scale/` + IPC `caisse:sendSaurusCatalog`
