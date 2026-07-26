# Administration — Utilisateurs

Gestion des comptes staff : création, édition, attribution de rôle et rattachement magasins.

## Accès

| Chemin | Permission requise |
|--------|-------------------|
| `/admin/utilisateurs` | `admin.utilisateurs` |
| Paramètres → Comptes → section Utilisateurs | slug `administrateur` (onglet Comptes) |

Composant : [`AdminUsersClient.tsx`](AdminUsersClient.tsx)

---

## Modèle de données

```
auth.users (Supabase Auth)
    │
    │ PK user_id
    ▼
profiles ──► roles
    │
    └──► profile_magasins ──► magasins
```

| Champ `profiles` | Description |
|------------------|-------------|
| `user_id` | Clé primaire, FK vers `auth.users` |
| `login` | Identifiant de connexion alternatif (min. 2 caractères, unique insensible à la casse) |
| `prenom`, `nom` | Nom affiché |
| `phone` | Téléphone WhatsApp (format international sans `+`, ex. `212612345678`) — chauffeur commandes, etc. |
| `role_id` | Rôle RBAC |
| `ui_locale` | Locale interface (`fr` ou `ar-MA`) |

---

## CRUD

### Création — `POST /api/admin/profiles`

Permission : `admin.utilisateurs`

| Champ | Requis | Notes |
|-------|--------|-------|
| `password` | oui | Min. 6 caractères |
| `role_id` | oui | UUID du rôle |
| `email` ou `login` | au moins un | Si pas d'email → `{uuid}@internal.opf` |
| `prenom`, `nom` | non | Défaut vide |
| `magasin_ids` | non | Requiert aussi `admin.magasins` |

Flux :

1. Création `auth.users` via service role (`createUser`, `email_confirm: true`)
2. Mise à jour ou insertion du profil (trigger auto ou API)
3. Sync `user_metadata` (prénom, nom, login)
4. Insertion `profile_magasins` si `magasin_ids` fourni

En cas d'échec profil → rollback (`deleteUser`).

### Lecture — `GET /api/admin/profiles`

Retourne la liste des profils avec :

- email Auth (via `listUsers`)
- rôle (id, name, slug)
- magasins liés (`profile_magasins` → `magasins`)

### Mise à jour — `PATCH /api/admin/profiles/[userId]`

Champs modifiables :

| Champ | Notes |
|-------|-------|
| `prenom`, `nom` | Sync vers `user_metadata` Auth |
| `phone` | Nullable ; téléphone WhatsApp |
| `login` | Nullable ; sync Auth |
| `role_id` | Interdit en self-service (trigger SQL) |
| `password` | Min. 6 caractères si fourni |
| `magasin_ids` | Remplace tous les liens ; requiert `admin.magasins` |

Le changement de rôle **ne supprime pas** les rattachements magasins existants.

### Suppression

Non implémentée — pas de route DELETE ni bouton dans l'UI.

---

## Rattachement magasins

Tout profil peut recevoir un ou plusieurs magasins via `profile_magasins` :

- **Création / édition** : multi-select « Magasins » (permission `admin.magasins` requise pour enregistrer)
- **API** : `magasin_ids` sur `POST` et `PATCH`
- **Session** : si des liens existent, `session.magasins` = ces magasins et `session.magasinsRestricted = true` (filtre CA, analyse stats, commandes fournisseur)
- **Sans lien** : administrateur ou rôle `is_full_access` → tous les magasins ; sinon aucun magasin en session

Logique : `src/lib/magasins/load-magasins-for-user.ts`

Migration : `supabase/migrations/20260427120000_magasins_caisses.sql`

---

## Connexion

L'utilisateur peut se connecter avec :

- Son **email** Supabase Auth
- Son **login** (`profiles.login`) — résolution email via service role

Voir [`login/README.md`](../../login/README.md).

---

## RLS (PostgreSQL)

| Action | Policy |
|--------|--------|
| Lire son propre profil | `user_id = auth.uid()` |
| Lire tous les profils | `admin.utilisateurs` |
| Modifier | soi-même ou `admin.utilisateurs` |
| Insérer / supprimer | `admin.utilisateurs` |

Trigger : un utilisateur ne peut pas modifier son propre `role_id` (`profiles_block_self_role_change`).

---

## Voir aussi

- [Documentation admin](../README.md) — architecture globale, catalogue permissions, guides opérationnels
- [Rôles](../roles/README.md) — matrice RBAC et rôles système
