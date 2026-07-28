# Gestion Charges

App backoffice `/charges` (permission `charges.read` / `charges.write`).

## Fonctionnalités

Trois onglets :

1. **Estimation** — charges récurrentes (`magasin_charge`) : libellé, qté, prix, périodicité `jour`|`mois`, par magasin ou **général**. Utilisées par `/ca` et `/historique-ca` **lorsqu’aucune feuille réelle** n’existe pour le mois.
2. **Feuilles mensuelles** — une feuille par `ym` (`YYYY-MM`) de charges **réelles** (montants du mois, sans périodicité). Détail : `/charges/feuilles/[ym]`, sections par **catégorie** puis magasin/général.
3. **Catégories** — référentiel éditable `ref_charge_categorie` (seed : Salaires, Loyer, Abonnement, Consommable).

## Stats (bénéfice net)

Si une feuille existe pour le `ym` concerné → charges **réelles** (jour = total mois ÷ jours du mois ; mois = somme des lignes). Sinon → **estimation**. Voir [`src/lib/ca/magasinCharges.ts`](../../lib/ca/magasinCharges.ts).

## API

| Route | Méthodes |
|-------|----------|
| `/api/ref/magasin-charges` | GET / POST (estimation) |
| `/api/ref/magasin-charges/[id]` | PATCH / DELETE |
| `/api/charges/categories` | GET / POST |
| `/api/charges/categories/[id]` | PATCH / DELETE |
| `/api/charges/feuilles` | GET / POST `{ ym }` |
| `/api/charges/feuilles/[ym]` | GET ; POST ligne |
| `/api/charges/feuilles/[ym]/lignes/[id]` | PATCH / DELETE |

Lecture : `charges.read` \| `charges.write` \| `ventes.read` (stats). Écriture : `charges.write`.

## Migrations

- `20260727150000_magasin_charge.sql` — estimation
- `20260728150000_gestion_charges.sql` — permissions, catégories, feuilles + lignes, RLS
