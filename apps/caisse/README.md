# Caisse magasin — Electron (Phase 1)

Application caisse Windows **1024×768** + écran client **plein écran sur le 2ᵉ moniteur** (si présent), inspirée WinDev.

Fenêtres **sans barre de titre ni menu** (mode kiosque Electron). Fermeture : Alt+F4.

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

### 3. Agent local (obligatoire)

L’installateur caisse **ne inclut pas** l’agent balance/impression. Sur le poste magasin :

1. Installer **Node.js 20+**
2. Copier le dossier projet (ou au minimum `apps/caisse-agent`, `packages/caisse-core`, `package.json`)
3. `npm install` puis `npm run dev:caisse-agent` (ou service Windows à configurer)
4. Créer `%ProgramData%\OPetitFrais\config.json` (ports COM, imprimante) — voir agent README

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

En bas à gauche de la caisse (barre d’état) :

| Affichage | Signification |
|-----------|----------------|
| `v0.1.0` | Version installée — **cliquer** pour vérifier manuellement les mises à jour |
| `v0.1.0 · À jour` | Dernière version (retour 3 s après vérification manuelle) |
| `v0.1.0 · MAJ 42%` | Téléchargement en cours |
| `v0.1.0 · MAJ prête` | Installateur téléchargé — **cliquer** sur « MAJ prête » pour installer et redémarrer |

**Fonctionnement (poste packagé uniquement)** :

1. Au démarrage puis toutes les 4 h, la caisse interroge `GET /api/caisse/release?token=…`
2. Si la version serveur est plus récente → téléchargement automatique (~83 Mo) en arrière-plan (`OPetitFrais-Caisse-Setup-{version}.exe`)
3. Une fois prêt, le caissier clique sur « MAJ prête » → installateur NSIS silencieux (`/S`) puis fermeture de la caisse

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
| `src/components/PaymentDialog.tsx` | Modal paiement (monnaie visuelle, modes avec icônes) |
| `src/components/CashMonnaieGrid.tsx` | Grille billets/pièces (disposition caisse) |
| `src/lib/payment-monnaie.ts` | Images billets/pièces, disposition grille et modes de paiement |
| `src/components/ClientSelectDialog.tsx` | Sélection / liste clients |
| `src/components/MenuDialog.tsx` | Menu caisse (actualiser prix, réimprimer ticket, paramètres) |
| `src/lib/last-ticket.ts` | Dernier ticket ESC/POS (localStorage) pour réimpression |
| `src/components/SettingsDialog.tsx` | Paramètres balance COM, IP SAURUS, imprimante ticket |
| `electron/main/saurus-scale/` | Protocole UDP LB1 (catalogue PLU) |
| `src/lib/hardware-config.ts` | Lecture / enregistrement config matérielle |
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
- [x] Paniers en attente (mise en attente, rappel, persistance locale)
- [x] Annulation des ajouts (pile LIFO, bouton rond à droite du clavier)
- [ ] Sync Supabase / catalogue réel (Phase 2)
- [ ] Parseur scan code-barres (plus tard)
- [ ] Auth caissier

## Config poste (futur)

`%ProgramData%\OPetitFrais\config.json` — magasin, caisse, ports COM.

## Import catalogue Supabase

Au démarrage, le catalogue est **préchargé** côté Electron avant l’affichage de la fenêtre ; la grille produits apparaît **en une seule fois** une fois le chargement terminé. Sans token ou en cas d’erreur API, la grille reste vide et un message d’erreur s’affiche.

Onglets catégories (ordre fixe) : **Légume**, **Fruit**, **Frigo**, **Herbes**, **Epice**, **Divers** — puis les autres catégories éventuelles.

Grille produits : **8×6 par page** (48 produits), navigation **Page précédente / suivante** — pas de défilement vertical. **Appui long** sur une vignette ou **clic sur une ligne panier** : même dialogue `ProductQtyDialog` (photo, clavier, **+** / **−** pour le signe, prix modifiable en édition).

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

Le client sélectionné est associé au panier ; obligatoire pour le mode paiement **Crédit**.

## Paiement

Modal **Paiement** : fenêtre large (`md`), hauteur ~**viewport − 48 px**. Bandeau **Total Panier** en haut. Disposition **2 colonnes** — modes, monnaie et liste à gauche ; **clavier rond à droite, ancré en bas**. Total / Monnaie au-dessus des boutons d’action.

- **Clic sur un mode** : ajoute le **reste à payer** (ou le total du panier si rien n'est encore encaissé). S'il ne reste rien à payer, une ligne à **0 DH** est créée ou sélectionnée pour saisie manuelle au clavier.
- **Espèces** : grille billets/pièces ; chaque clic additionne avec le **détail des monnaies** en petit. Re-clic sur le bouton **Espèces** : **remplace** la ligne (efface le détail) avec le total panier ou le reste à payer.
- **Clavier rond** : saisie libre sur le mode actif. Ligne sélectionnée : montant affiché au clavier ; **1ʳᵉ touche = nouvelle saisie** ; **OK remplace** la ligne puis **efface** le clavier.
- Chaque ligne peut être retirée individuellement (×). Total paiement et monnaie à rendre en bas.

## Ticket de caisse (ESC/POS 80 mm)

Modèle aligné sur le ticket WinDev (`ticket2.pdf`) — **Font B 64 colonnes**, code page **CP1252** :

1. **En-tête** — titre magasin centré, ligne magasin/caisse, colonnes **Produit | Qté | Prix | Total** en gras, trait séparateur.
2. **Corps** — blocs par **catégorie** (`--- Légume ---` centré), lignes produit en majuscules (retour à la ligne si nom long).
3. **Pied** — date/heure, paiements, **Magasin / Caisse / No Ticket**, **code-barres** pleine largeur (réf. sous les barres), messages de remerciement alignés à gauche.

En-tête ticket : **logo O'petit frais** (raster ESC/POS). Regénérer le logo : `npm run generate:logo -w @opf/caisse-core`.

Montants avec **virgule** décimale (`12,50`). Génération : `buildSaleTicketEscPos` dans `@opf/caisse-core`.

**Impression** : bouton **Valider** (pas « Valider sans ticket ») — le ticket est sauvegardé localement puis envoyé à l’agent (`POST /print`). L’agent doit tourner (`npm run dev:caisse-agent`) et une **imprimante ticket** doit être choisie dans **Menu → Paramètres**. En cas d’échec d’impression, le ticket reste disponible via **Imprimer dernier ticket**.

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
- **Imprimer dernier ticket** — réimprime le dernier ticket de vente (activé après un paiement avec impression).
- **Paramètres** — port **COM** balance, **IP balance SAURUS**, **imprimante ticket** (`caisse.config.json`).
- **Fermer caisse** — quitte l’application Electron (confirmation demandée).

Colonne droite (panier) : logo **O'petit frais** sur fond blanc + bouton **Menu** en haut à droite ; **Client**, **Attente**, **Supprimer panier** (icône) ; clavier avec colonne **Retour** + **Paiement**.

Barre du bas (colonne produits) : **internet** + **serveur API** + **balance SAURUS** (pastilles vert/rouge) + **date** à gauche, pagination au centre, switch **Imprimer prix** à droite. **Balance** + bouton **T** à droite de la rangée catégories — poids en police **7 segments** (`formatBalanceWeightKgFr` : **2 décimales** si &lt; 0, **3 décimales** de 0 à 10 kg, **2 décimales** ≥ 10 kg), fond **rouge** si poids négatif, **Kg** fixe à droite.

La config matérielle est persistée dans `caisse.config.json` (userData Electron en prod) et synchronisée avec l’agent via `POST /config/hardware`. Chaque impression envoie aussi le nom d’imprimante choisi dans les paramètres. Changer le port COM reconnecte la balance automatiquement.

## Balance USB

L'agent détecte automatiquement le port **CH340** (wch.cn) ou lit `scalePort` dans `caisse.config.json`. Variable d'environnement `OPF_SCALE_PORT` prioritaire si définie.

## Balance SAURUS (réseau)

Balance étiqueteuse **LB1** en UDP port **5001** (protocole reverse-engineer, voir `scale-sniffer/PROTOCOL.md`).

- **Paramètres** : champ `saurusScaleIp` (ex. `192.168.0.87`) dans `caisse.config.json`
- **Menu** : **Envoyer prix balance SAURUS** — catalogue en cache (produits actifs, PLU = chiffres du code produit)
- Implémentation : `electron/main/saurus-scale/` + IPC `caisse:sendSaurusCatalog`
