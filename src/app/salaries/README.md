# Salariés — Gestion RH magasin

Module de gestion du personnel rattaché à chaque magasin : fiche salarié, documents, paiements/avances, événements (maladie, congés), horaires récurrents et planning hebdomadaire.

## Permissions

| Clé | Description |
|-----|-------------|
| `salaries.read` | Consultation liste, fiche, planning |
| `salaries.write` | Création / modification / suppression |

Attribution initiale : rôles **gestionnaire** et **administrateur** (full access).

Routes protégées dans `src/lib/auth/route-permissions.ts` :

- `/salaries` → `salaries.read`
- `/salaries/planning` → `salaries.read`

## Scoping site

- Chaque salarié est lié à un `magasin_id` (site : magasin, cuisine, autre).
- Liste des sites : `GET /api/salaries/sites` — **tous les sites** de l’organisation pour les utilisateurs avec `salaries.read`.
- L’API vérifie que le site existe (permission `salaries.read` requise en amont).
- En session générale : magasins via `profile_magasins`, ou tous pour administrateur / `is_full_access` (commandes, etc.).

## Schéma base (migration `20260803190000_salaries.sql`)

| Table | Rôle |
|-------|------|
| `salarie` | Fiche : prénom (obligatoire), nom (optionnel), dates arrivée/départ, notes, lien optionnel `profile_id` |
| `salarie_document` | Documents avec `label` + `storage_path` (bucket `salaries-documents`) |
| `salarie_paiement` | Paiements `salaire` ou `avance`, modes via `ref_payment_method` |
| `salarie_evenement` | Maladie, congé, autre (période inclusive) |
| `salarie_horaire` | Modèle récurrent 7 jours (0=lundi … 6=dimanche) |
| `salarie_planning_shift` | Surcharge planning par semaine ISO (`semaine` = lundi) |

Fonctions RLS : `current_user_can_access_magasin`, `salarie_magasin_access`.

## Routes API

| Route | Méthodes |
|-------|----------|
| `/api/salaries/sites` | GET — tous les sites (type inclus) |
| `/api/salaries` | GET (`magasinId`), POST |
| `/api/salaries/[id]` | GET, PATCH, DELETE |
| `/api/salaries/[id]/documents` | GET, POST (FormData), DELETE |
| `/api/salaries/[id]/paiements` | GET, POST |
| `/api/salaries/[id]/paiements/[paiementId]` | DELETE |
| `/api/salaries/[id]/evenements` | GET, POST, PATCH, DELETE |
| `/api/salaries/[id]/horaires` | GET, PUT |
| `/api/salaries/[id]/planning/prefill` | POST (remplit la semaine depuis horaires récurrents) |
| `/api/salaries/planning` | GET (`magasinId`, `semaine`, `salarieId?`) |
| `/api/salaries/planning/shifts` | POST, DELETE |

## UI

| Page | Fichier |
|------|---------|
| Liste | `SalariesListClient.tsx` |
| Fiche (onglets) | `[id]/SalarieDetailClient.tsx` |
| Planning | `planning/PlanningClient.tsx` |

Composants partagés : `src/features/salaries/`.

Formulaires avec saisie : `FormDialog` (règle projet).

### Onglets fiche salarié

1. **Informations** — identité, site (transfert magasin), notes, date de départ
2. **Documents** — photos (caméra / galerie) et fichiers PDF avec aperçu miniature
3. **Paiements** — salaires, avances, solde (salaires − avances)
4. **Événements** — maladie, congés
5. **Horaires** — grille 7 jours (repos ou plage horaire)

### Planning

- Filtres : **site**, semaine (← →)
- Vue **magasin** : tous les salariés actifs
- Vue **salarié** : focus + bouton « Depuis horaires récurrents »
- Clic cellule → dialog créneau (travail / repos / malade / congé)

## Fichiers lib

- `src/lib/salaries/types.ts`
- `src/lib/salaries/api-helpers.ts`
- `src/lib/salaries/documents.ts`
- `src/lib/salaries/queries.ts`
- `src/lib/salaries/planning.ts`

## i18n

Clés sous `backoffice.salaries.*` dans `src/messages/fr.json` et `ar-MA.json`.

## Notes métier

- Salarié **parti** (`date_depart` renseignée) : fiche en lecture seule sauf réactivation.
- Pas de lien automatique avec les feuilles de charges « Salaires » en v1.
- Les salariés sont distincts des comptes utilisateurs app (`profiles`), avec lien optionnel futur via `profile_id`.
