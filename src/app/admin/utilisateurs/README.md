# Administration — Utilisateurs

## Rattachement magasins

Tout profil peut recevoir un ou plusieurs magasins via la table `profile_magasins` :

- **Création / édition** : multi-select « Magasins » (permission `admin.magasins` requise pour enregistrer).
- **API** : `magasin_ids` sur `POST /api/admin/profiles` et `PATCH /api/admin/profiles/[userId]`.
- **Session** : si des liens existent, `session.magasins` = ces magasins et `session.magasinsRestricted = true` (filtre CA, analyse stats, commandes fournisseur, etc.).
- **Sans lien** : administrateur ou rôle `is_full_access` → tous les magasins ; sinon aucun magasin en session.

Le changement de rôle **ne supprime plus** les rattachements existants.
