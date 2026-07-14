# Administration — Rôles et permissions

Gestion de la matrice RBAC : rôles système, rôles personnalisés et attribution des permissions.

## Accès

| Chemin | Permission requise |
|--------|-------------------|
| `/admin/roles` | `admin.roles` |
| Paramètres → Comptes → section Rôles | slug `administrateur` (onglet Comptes) |

Composant : [`AdminRolesClient.tsx`](AdminRolesClient.tsx)

La lecture des rôles (`GET /api/admin/roles`) est aussi autorisée avec `admin.utilisateurs` (pour le select de rôle lors de la création d'utilisateur).

---

## Rôles système

Les rôles avec `is_system = true` ne peuvent pas être supprimés.

| Slug | `is_full_access` | Comportement |
|------|------------------|--------------|
| `administrateur` | true | Bypass total ; seul rôle avec slug réservé (`isAdministrator`) |
| `gestionnaire` | false | Exploitation courante |
| `acheteur` | false | Catalogue, paramètres, achat CF |
| `caissier` | false | Consultation catalogue, saisie CF |

Un seul rôle peut avoir `is_full_access = true` (index unique partiel en base).

---

## Rôles personnalisés

Création via `POST /api/admin/roles` :

- `name` (requis) — libellé affiché
- `slug` (optionnel) — généré automatiquement depuis le nom si absent (`roleSlugFromName`)
- `description` (optionnel)
- Toujours créés avec `is_system = false`, `is_full_access = false`

Suppression (`DELETE /api/admin/roles/[id]`) refusée si :

- le rôle est système (`is_system`)
- des utilisateurs ont encore ce `role_id`

---

## Matrice permissions

Édition via `PUT /api/admin/roles/[id]/permissions` avec un tableau `permission_ids`.

- Pour un rôle `is_full_access` : la matrice est **ignorée** (toutes les permissions sont accordées via bypass)
- Les permissions sont groupées par `module` dans l'UI
- Catalogue complet : voir [README admin](../README.md#catalogue-des-permissions)

### Permissions par rôle (seed initial)

| Permission | administrateur | gestionnaire | acheteur | caissier |
|------------|:--------------:|:------------:|:--------:|:--------:|
| `produits.read` | ✓* | ✓ | ✓ | ✓ |
| `produits.write` | ✓* | ✓ | ✓ | |
| `ventes.read` | ✓* | ✓ | | |
| `parametres.read` | ✓* | ✓ | ✓ | |
| `parametres.write` | ✓* | ✓ | ✓ | |
| `admin.utilisateurs` | ✓* | | | |
| `admin.roles` | ✓* | | | |
| `admin.magasins` | ✓* | | | |
| `commandes_fournisseur.saisie` | ✓* | | | ✓ |
| `commandes_fournisseur.consolidation` | ✓* | ✓ | | |
| `commandes_fournisseur.achat` | ✓* | | ✓ | |
| `commandes_fournisseur.vendeurs_renommer` | ✓* | | ✓ | |
| `cuisine.saisie` | ✓* | ✓ | | |
| `cuisine.historique` | ✓* | ✓ | | |
| `sync.run` | ✓* | | | |

\* Via `is_full_access` (bypass), pas via `role_permissions`.

Les rôles custom démarrent sans permission ; la matrice est entièrement configurable.

---

## API

| Méthode | Route | Permission | Description |
|---------|-------|------------|-------------|
| GET | `/api/admin/roles` | `admin.roles` ou `admin.utilisateurs` | Rôles, permissions, liens |
| POST | `/api/admin/roles` | `admin.roles` | Créer rôle |
| PATCH | `/api/admin/roles/[id]` | `admin.roles` | Modifier nom / description |
| DELETE | `/api/admin/roles/[id]` | `admin.roles` | Supprimer rôle |
| PUT | `/api/admin/roles/[id]/permissions` | `admin.roles` | Remplacer permissions |

Toutes les écritures passent par la **service role** après vérification de permission.

---

## RLS (PostgreSQL)

| Table | Lecture | Écriture |
|-------|---------|----------|
| `roles` | Tout authentifié | `admin.roles` |
| `permissions` | `admin.roles` | — |
| `role_permissions` | Tout authentifié | `admin.roles` |

Fonctions utilitaires : `current_role_has_permission()`, `get_my_permission_keys()`.

Migration : `supabase/migrations/20260423120000_profiles_roles_permissions.sql`

---

## Voir aussi

- [Documentation admin](../README.md) — architecture globale, auth, périmètre magasin
- [Utilisateurs](../utilisateurs/README.md) — assignation de rôle aux profils
