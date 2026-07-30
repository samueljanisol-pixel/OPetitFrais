# Caisse agent — service local Windows

API HTTP locale pour la balance Arduino, l'impression ESC/POS et (futur) périphériques.

Port par défaut : **4711**

**Production (≥ 0.1.7)** : l'agent est **intégré à l'exe caisse** — démarrage automatique, Node.js non requis sur le poste.

**Développement** : lancer l'agent séparément si besoin (voir ci-dessous).

## Démarrage

```bash
# Mode mock (sans Arduino)
npm run dev:caisse-agent

# Avec Arduino (CH340) — lister les ports USB
npm run list-ports -w @opf/caisse-agent
# Ex. COM9  wch.cn  1A86:7523  → adaptateur CH340

$env:OPF_SCALE_PORT="COM9"
npm run dev:caisse-agent
```

### Dépannage USB

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Port absent dans `list-ports` | Driver CH340 | Gestionnaire de périphériques → driver **wch.cn** / CH340 |
| `Opening COMx: Access denied` | Moniteur série Arduino ou autre app | Fermer **Moniteur série** Arduino IDE, puis `POST /weight/reconnect` ou relancer l'agent |
| `source: mock` après modification code | tsx watch n'a pas libéré COM9 | L'agent retente seul toutes les 3 s ; ou `curl -X POST http://127.0.0.1:4711/weight/reconnect` |
| `source: mock` sans erreur | `OPF_SCALE_PORT` non défini | Définir la variable avant `npm run dev:caisse-agent` |

Vérification rapide :

```powershell
curl.exe -s http://127.0.0.1:4711/weight
# Attendu : "source":"serial", poids qui bouge quand vous posez quelque chose sur la balance
```

## Balance Arduino (HX711)

| Paramètre | Valeur |
|-----------|--------|
| Baud | **115200** (`OPF_SCALE_BAUD`, défaut) |
| Port | `OPF_SCALE_PORT` ex. `COM3` |
| Format ligne | `{grammes};{S\|U}` |
| Grammes | Entier arrondi au **5 g** (1315 → **1,315 kg**) |
| `S` | Poids **stable** (verrouillé) |
| `U` | Poids **instable** |

Exemple série : `1315;S`

### Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Statut agent + source balance |
| GET | `/weight` | `{ weightKg, weightGrams, stable, source, raw }` |
| GET | `/weight/stream` | SSE — push à chaque ligne série (~50 ms) |
| POST | `/weight/tare` | Envoie `T` à l'Arduino (tare manuelle) |
| POST | `/weight/reconnect` | Ferme et rouvre le port série (`{ scalePort? }`) |
| POST | `/weight/mock` | Dev — `{ weightKg, stable? }` sans Arduino |
| GET | `/serial/ports` | Liste des ports COM disponibles |
| GET | `/printers` | Liste des imprimantes Windows |
| GET | `/config/hardware` | `{ scalePort, ticketPrinter }` |
| POST | `/config/hardware` | Enregistre `{ scalePort?, ticketPrinter? }` + reconnecte si besoin |
| POST | `/print` | `{ dataBase64, ticketPrinter? }` — ESC/POS RAW ; `ticketPrinter` prioritaire si fourni par la caisse |

### Commandes Arduino (référence firmware)

| Cmd | Action |
|-----|--------|
| `T` | Tare manuelle |
| `V` / `R` / `O` / `E` | LEDs NeoPixel |
| `C` + calibration | Mode calibration (ignoré par l'agent) |

## Impression

`POST /print` — reçoit le ticket ESC/POS en base64 et l'envoie en **RAW** vers l'imprimante ticket configurée (spooler Windows, ex. Epson TM-T20III).
