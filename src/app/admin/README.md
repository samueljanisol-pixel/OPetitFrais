# Administration — Utilisateurs et droits

Documentation du système d'authentification, de gestion des utilisateurs et du contrôle d'accès (RBAC) de l'application back-office.

## Vue d'ensemble

```
Supabase Auth (auth.users)
        │
        │ 1:1
        ▼
   profiles ──────────► roles
        │                    │
        │                    └──► role_permissions ──► permissions
        │
        └──► profile_magasins ──► magasins
```

| Couche | Rôle |
|--------|------|
| **Supabase Auth** | Authentification email + mot de passe, session JWT (cookies SSR) |
| **`profiles`** | Profil métier 1:1 avec `auth.users` (login, prénom, nom, rôle, locale UI) |
| **`roles` / `permissions` / `role_permissions`** | RBAC dynamique — matrice éditable |
| **`profile_magasins`** | Périmètre magasin par utilisateur (CA, stats, commandes fournisseur) |

Les droits sont appliqués à **trois niveaux** :

1. **PostgreSQL / RLS** — fonctions `current_role_has_permission()`, `get_my_permission_keys()`, policies sur tables sensibles
2. **Proxy Next.js** — `src/proxy.ts` + `src/lib/auth/route-permissions.ts` (contrôle des pages)
3. **API & UI** — `requireApiPermission()`, hook `useSessionPermissions()`

Les opérations admin (création utilisateur, gestion rôles) passent par la **service role** Supabase côté serveur, après vérification des permissions via le client authentifié.

---

## Authentification

### Connexion

- Page : `/login` — voir [`login/README.md`](../login/README.md)
- API : `POST /api/auth/login`
- Déconnexion : `POST /api/auth/logout`
- Session : `GET /api/auth/session` → `SessionPayload`

**Identifiants acceptés :**

| Format | Comportement |
|--------|--------------|
| Email (`@` présent) | Connexion directe via Supabase Auth |
| Login (`profiles.login`) | Résolution email via service role, puis `signInWithPassword` |

Si aucun email n'est fourni à la création d'un utilisateur, un email technique `{uuid}@internal.opf` est généré.

### Cycle de vie du profil

- **Trigger `on_auth_user_created_profile`** : à chaque création dans `auth.users`, un profil est créé automatiquement
  - **Premier utilisateur** → rôle `administrateur`
  - **Utilisateurs suivants** → rôle `gestionnaire` (sauf si le profil est déjà créé par l'API admin)
- **Trigger `profiles_block_self_role_change`** : un utilisateur ne peut pas modifier son propre `role_id`
- **Suppression utilisateur** : non implémentée dans l'UI (pas de route DELETE) ; `deleteUser` utilisé uniquement en rollback si la création échoue

### Variables d'environnement requises

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Session utilisateur, proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | Login par identifiant, CRUD admin utilisateurs/rôles |

---

## Rôles système

| Slug | Nom | `is_full_access` | Permissions par défaut |
|------|-----|------------------|------------------------|
| `administrateur` | Administrateur | **true** | Toutes (bypass via `is_full_access`) |
| `gestionnaire` | Gestionnaire | false | produits, ventes, paramètres, consolidation CF, cuisine |
| `acheteur` | Acheteur | false | produits, paramètres, achat CF, vendeurs_renommer |
| `caissier` | Caissier | false | produits.read, saisie CF |

Des **rôles personnalisés** peuvent être créés via l'UI (`is_system=false`, `is_full_access=false`).

Migration fondatrice : `supabase/migrations/20260423120000_profiles_roles_permissions.sql`

---

## Catalogue des permissions

| Clé | Module | Description | Routes UI principales |
|-----|--------|-------------|----------------------|
| `produits.read` | produits | Voir le catalogue | `/produits`, `/produits/[id]` |
| `produits.write` | produits | Créer / modifier produits | `/produits/nouveau`, édition fiche |
| `ventes.read` | ventes | Voir CA et historique | `/ca`, `/historique-ca`, `/analyse-stats` |
| `parametres.read` | parametres | Voir Paramètres | `/referentiel` |
| `parametres.write` | parametres | Modifier Paramètres | édition référentiels |
| `admin.utilisateurs` | admin | Gérer les utilisateurs | `/admin/utilisateurs`, onglet Comptes |
| `admin.roles` | admin | Gérer rôles et permissions | `/admin/roles`, onglet Comptes |
| `admin.magasins` | admin | Magasins, caisses, rattachements | onglet Comptes → Magasins |
| `commandes_fournisseur.saisie` | commandes_fournisseur | Saisie commande magasin | `/commandes-fournisseur/saisie/*` |
| `commandes_fournisseur.consolidation` | commandes_fournisseur | Consolidation / validation lots | `/commandes-fournisseur/consolidation/*`, `/validation/*` |
| `commandes_fournisseur.achat` | commandes_fournisseur | Achat sur lots | `/commandes-fournisseur/achat/*` |
| `commandes_fournisseur.vendeurs_renommer` | commandes_fournisseur | Renommer vendeurs | achat CF |
| `cuisine.saisie` | cuisine | Saisie journal (jour courant) | `/cuisine/saisie/*` |
| `cuisine.historique` | cuisine | Historique et totaux | `/cuisine/historique/*` |
| `sync.run` | sync | Synchronisations | *(prévue en base, non câblée dans l'app)* |

Chemins non listés dans `route-permissions.ts` → **accès autorisé par défaut** (si connecté).

---

## `isFullAccess` vs `isAdministrator`

Deux concepts distincts coexistent :

| Concept | Définition | Usages |
|---------|------------|--------|
| **`isFullAccess`** | `roles.is_full_access === true` | Bypass toutes les permissions ; tous les magasins si pas de `profile_magasins` |
| **`isAdministrator`** | `roles.slug === "administrateur"` | Onglet Comptes (Paramètres) ; `StatusLabelsAdminPanel` ; `requireApiAdministrator()` ; bypass magasin CF en RLS |

Un rôle custom avec `is_full_access` n'est **pas** considéré administrateur pour les fonctions réservées au slug `administrateur`.

---

## Périmètre magasin

Règles dans `loadMagasinsForUser()` (`src/lib/magasins/load-magasins-for-user.ts`) :

1. Si `profile_magasins` non vide → magasins liés, `magasinsRestricted = true`
2. Sinon si slug `administrateur` ou `is_full_access` → tous les magasins
3. Sinon → aucun magasin en session

Impact : filtrage CA, analyse stats, commandes fournisseur. Côté RLS CF, la saisie exige un lien magasin **sauf** pour le slug `administrateur`.

Voir [`utilisateurs/README.md`](utilisateurs/README.md) pour les détails API `magasin_ids`.

---

## Interfaces d'administration

| Page | Permission | Composant |
|------|------------|-----------|
| `/admin/utilisateurs` | `admin.utilisateurs` | `AdminUsersClient.tsx` |
| `/admin/roles` | `admin.roles` | `AdminRolesClient.tsx` |
| Paramètres → onglet **Comptes** | slug `administrateur` uniquement | `ReferentielClient.tsx` |

L'onglet Comptes regroupe utilisateurs, rôles et magasins pour l'administrateur système. Les pages `/admin/*` restent accessibles avec les permissions métier correspondantes.

---

## API admin

| Route | Permission | Actions |
|-------|------------|---------|
| `GET/POST /api/admin/profiles` | `admin.utilisateurs` | Lister / créer utilisateurs |
| `PATCH /api/admin/profiles/[userId]` | `admin.utilisateurs` | Modifier profil, rôle, mot de passe, magasins |
| `GET /api/admin/roles` | `admin.roles` **ou** `admin.utilisateurs` | Liste rôles + permissions + liens |
| `POST /api/admin/roles` | `admin.roles` | Créer rôle custom |
| `PATCH /api/admin/roles/[id]` | `admin.roles` | Renommer / description |
| `DELETE /api/admin/roles/[id]` | `admin.roles` | Supprimer (interdit si `is_system` ou utilisateurs assignés) |
| `PUT /api/admin/roles/[id]/permissions` | `admin.roles` | Remplacer matrice (ignorée si `is_full_access`) |

Enregistrement des magasins (`magasin_ids`) : permission `admin.magasins` requise en plus.

---

## Couches de contrôle (développeurs)

### Proxy (`src/proxy.ts`)

Pour chaque requête page (hors chemins publics) :

1. Vérifier session Supabase
2. Appeler `get_my_permission_keys()`
3. Lire `roles.is_full_access`
4. `canAccessPath(pathname, keys, isFullAccess)` → sinon redirect `/access-refuse`

### Garde API serveur

```ts
// Permission unique
const gate = await requireApiPermission("admin.utilisateurs");

// Au moins une permission
const gate = await requireAnyApiPermission(["admin.roles", "admin.utilisateurs"]);

// Slug administrateur uniquement
const gate = await requireApiAdministrator();
```

Fichiers : `src/lib/auth/require-permission-api.ts`, `src/lib/auth/require-administrator-api.ts`

### Hook client

`useSessionPermissions()` (`src/lib/auth/useSessionPermissions.ts`) expose :

- `can(key)`, `isFullAccess`, `isAdministrator`
- Flags prédéfinis : `canWriteProducts`, `canAdminUsers`, `canAdminRoles`, etc.
- `linkedMagasins`, `magasinsRestricted`

Type session : `SessionPayload` dans `src/lib/auth/session-types.ts`

### Fonctions SQL

| Fonction | Usage |
|----------|-------|
| `current_profile()` | Profil JWT courant |
| `current_role_has_permission(p_key)` | Vérification RLS |
| `get_my_permission_keys()` | Liste clés pour middleware/UI/API |
| `current_user_is_administrateur()` | Bypass périmètre magasin CF |
| `profiles_with_permission(p_key)` | Notifications — destinataires |

**Edge case** : si l'utilisateur authentifié n'a **pas de profil**, `get_my_permission_keys()` retourne **toutes** les permissions (fallback permissif).

### RLS — domaines protégés

| Domaine | RLS basée sur permissions |
|---------|----------------------------|
| `profiles`, `roles`, `role_permissions`, `permissions` | Oui |
| `magasins`, `caisses`, `profile_magasins` | Oui |
| Commandes fournisseur | Oui + périmètre magasin |
| Cuisine journal | Oui |
| Catalogue produit (`product`, `ref_*` initiaux) | Non — « all authenticated » ; contrôle surtout app-layer |
| CA (`ca_*`) | Lecture pour tout authentifié |

---

## Guides opérationnels

### Créer un caissier pour un magasin

1. Créer l'utilisateur avec le rôle **Caissier**
2. Rattacher le(s) magasin(s) via le multi-select (nécessite `admin.magasins`)
3. L'utilisateur aura accès à la saisie commandes fournisseur pour ses magasins uniquement

### Créer un acheteur

1. Rôle **Acheteur** (accès achat CF + renommage vendeurs)
2. Sans rattachement magasin → pas de magasins en session (sauf `is_full_access`)
3. L'acheteur travaille sur les lots consolidés, pas la saisie magasin

### Créer un rôle personnalisé

1. `/admin/roles` ou Paramètres → Comptes → Rôles
2. Créer le rôle (nom → slug auto-généré)
3. Cocher les permissions dans la matrice
4. Assigner le rôle aux utilisateurs concernés

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/lib/auth/route-permissions.ts` | Mapping routes ↔ permissions |
| `src/lib/auth/require-permission-api.ts` | Garde API |
| `src/lib/auth/require-administrator-api.ts` | Garde slug administrateur |
| `src/lib/auth/useSessionPermissions.ts` | Hook client |
| `src/lib/auth/session-types.ts` | Type `SessionPayload` |
| `src/lib/magasins/load-magasins-for-user.ts` | Magasins session |
| `src/proxy.ts` | Middleware auth + permissions |
| `src/app/api/auth/login/route.ts` | Connexion |
| `src/app/api/auth/session/route.ts` | Payload session |
| `src/app/api/admin/profiles/*.ts` | CRU utilisateurs |
| `src/app/api/admin/roles/*.ts` | CRUD rôles + matrice |

Documentation détaillée :

- [Utilisateurs](utilisateurs/README.md)
- [Rôles](roles/README.md)
