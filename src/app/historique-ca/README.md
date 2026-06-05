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
| Jour record par magasin | Meilleur CA journalier de chaque magasin sur la période filtrée, avec montant et date |

Le jour record global et les records par magasin sont recalculés à chaque changement de filtre (2026, 2025, Tous).

## Détail par mois (`<details>`)

Chaque mois affiche, dans le résumé :

| Bloc | Description |
|------|-------------|
| Total mois / Moyenne / jour | CA du mois (comme avant) |
| Paniers (mois) / Moy. paniers / jour | Somme et moyenne journalière des paniers sur les jours du mois |
| CA par magasin (mois) | Part du CA du mois (%), total et moyenne journalière par magasin |
| Paniers par magasin (mois) | Total et moyenne journalière des paniers par magasin |

En ouvrant le mois, chaque jour affiche le CA, le nombre de paniers du jour, et par magasin le CA et le nombre de paniers lorsque disponibles.

## Données

- Source : Supabase (`fetchHistoriqueFromSupabase`), avec sync FTP automatique au premier chargement si stale.
- Borne basse : `2025-05-13` (`HISTORIQUE_FROM_ISO`).
- Rôle caissier : CA limité aux magasins assignés à la session.
