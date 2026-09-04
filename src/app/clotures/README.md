# Clôtures de caisse

Contrôle des clôtures envoyées par les postes Electron (`/clotures`).

## Accès

- Liste / détail : `ventes.read`
- Bouton **Vérifier** : `ventes.write`
- Périmètre magasin : `profile_magasins` (ou tous les magasins si administrateur / full access sans rattachement)
- Filtre magasin toujours affiché ; **magasin test `00` inclus** pour l’instant

Menu accueil : bouton **Clôtures** (même permission que Statistique), avec badge du nombre **à vérifier**.

## Statuts

| Code | Libellé |
|------|---------|
| `a_verifier` | À vérifier — état initial à la clôture caissier |
| `verifiee` | Vérifiée — après saisie des billets manager |

Libellés éditables : Paramètres → statuts, domaine `caisse_cloture`.

## Détail

Totaux issus du **snapshot** calculé sur le poste à la clôture (pas recalculés depuis les tickets) :

- Total vente / dont Crédit (ventes à crédit)
- Nombre de ventes, panier moyen, livraison
- Total règlement (paiements hors crédit)
- Détail par mode (`Carte (N)` = nombre de tickets carte)
- « dont Paiement Crédit » masqué tant que le montant est 0 (règlement de dette : plus tard)

## Vérification

Saisie billets 200 / 100 / 50 / 20 : boutons −10 / −1 à gauche du champ, +1 / +10 à droite. Écart affiché avec signe **+** (vert, surplus) ou **−** (rouge, manque).

- Total compté
- Total + fond de caisse (détail entre parenthèses, ex. `2 x 50, 1 x 20`)
- Total vente espèces
- Écart = (total compté + fond) − vente espèces

## API

| Méthode | Route | Permission |
|---------|-------|------------|
| GET | `/api/clotures` | `ventes.read` ou `ventes.write` |
| GET | `/api/clotures/count` | idem — `{ a_verifier }` pour le badge accueil |
| GET | `/api/clotures/[clotureRef]` | idem |
| PATCH | `/api/clotures/[clotureRef]` | `ventes.write` |

Envoi POS : `POST /api/caisse/ventes` et `POST /api/caisse/clotures` (token caisse). En **dev Electron**, l’export va vers le Next local (`http://localhost:3000`), pas vers l’URL prod du poste — les routes n’existent pas encore sur `opetitfrais.janisol.ma`. Au relance de la caisse, les clôtures déjà dans `clotures.json` sont renvoyées.

Migration : `supabase/migrations/20260904140000_caisse_tickets_clotures.sql`
