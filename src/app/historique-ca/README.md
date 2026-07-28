# Historique CA

Page de consultation de l’historique du chiffre d’affaires par jour et par mois.

## Filtres de période

Les boutons **2026**, **2025** et **Tous** restreignent les agrégats et le détail mensuel aux jours correspondants.

## Indicateurs en en-tête

| Carte | Description |
|-------|-------------|
| Total global | Somme du CA sur la période filtrée |
| Moyenne / jour | Total global ÷ nombre de jours |
| Moyenne / mois | Total global ÷ nombre de mois avec données |
| Jour record | Meilleur CA journalier sur la période filtrée, avec la date affichée |
| Paniers total | Somme des `nb_paniers` (table `ca_day`) sur la période filtrée |
| Moy. paniers / jour | Paniers total ÷ nombre de jours |
| Moy. paniers / mois | Paniers total ÷ nombre de mois avec données |
| Bénéfice estimé | Somme des bénéfices (qté × marge historique explicite) sur la période filtrée, avec % du CA et % du CA avec marge |
| Charges | Si feuille réelle du mois : somme des lignes ; sinon estimation (forfait mensuel ×1 + journalières × jours filtrés) |
| Bénéfice net estimé | Bénéfice estimé − charges |
| Moy. bénéfice / jour | Bénéfice estimé ÷ nombre de jours |
| Moy. bénéfice net / jour | Bénéfice net ÷ nombre de jours |
| Moy. bénéfice / mois | Bénéfice estimé ÷ nombre de mois avec données |
| Jour record par magasin | Meilleur CA journalier de chaque magasin sur la période filtrée, avec montant et date |

Le jour record global et les records par magasin sont recalculés à chaque changement de filtre (2026, 2025, Tous).

## Détail par mois (`<details>`)

Chaque mois affiche, dans le résumé :

| Bloc | Description |
|------|-------------|
| Total mois / Moyenne / jour | CA du mois (comme avant) |
| Bénéfice estimé | Total du mois (mêmes règles que la page Statistique), avec % du CA et % du CA avec marge |
| Charges / Bénéfice net | Réel si feuille du `ym`, sinon estimation mois ; net = bénéfice − charges |
| Paniers (mois) / Moy. paniers / jour | Somme et moyenne journalière des paniers sur les jours du mois |
| CA par magasin (mois) | Part du CA du mois (%), total, moyenne journalière, **bénéfice estimé**, charges et net par magasin |
| Paniers par magasin (mois) | Total et moyenne journalière des paniers par magasin |

En ouvrant le mois, chaque jour affiche le CA, le bénéfice, les charges (réel prorata ou estimation jour), le bénéfice net, le nombre de paniers, et par magasin le détail correspondant.

## Données

- Source : Supabase (`fetchHistoriqueFromSupabase`), avec sync FTP automatique au premier chargement si stale.
- CA / paniers : table `ca_day`.
- Bénéfice estimé : table `ca_product_day` + historique de marges explicites (`fetchBenefitByDayMagasinForDateRange`) — mêmes règles que `/ca` (jour et mois) ; produits sans marge renseignée ou `qty ≤ 0` exclus ; résolution produit alignée sur le catalogue (id / code article).
- Charges : **feuille réelle** (`magasin_charge_feuille` + lignes) si le `ym` existe, sinon estimation `magasin_charge` — lib `src/lib/ca/magasinCharges.ts` ; générales uniquement sur les totaux globaux. Saisie : `/charges`.
- Borne basse : `2025-05-13` (`HISTORIQUE_FROM_ISO`).
- Périmètre magasin restreint (`session.magasinsRestricted`) : CA, bénéfice et charges limités aux magasins assignés au profil.
