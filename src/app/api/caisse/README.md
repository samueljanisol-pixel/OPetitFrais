# API caisse (WinDev)

## Impression commande magasin

Le **PDF pose problème** avec WinDev / l’imprimante ticket (pages coupées, seule la fin s’imprime).  
**Ne plus s’appuyer sur le PDF** pour la caisse. Deux formats fiables :

| Priorité | Format | Usage |
|----------|--------|--------|
| 1 (recommandé) | `format=txt` | Texte ESC/POS 64 col., bandeau fournisseur inversé → `copy /b` |
| 2 | `format=json` | Données structurées → **état d’impression WinDev** natif (comme vos tickets caisse qui marchent) |
| 3 (legacy) | `format=pdf` | À éviter côté caisse |

### URL

```
GET /api/caisse/commande-ticket?magasin=M02&token=…&lang=FR&format=txt
GET /api/caisse/commande-ticket?magasin=M02&token=…&lang=FR&format=json
```

| Paramètre | Requis | Description |
|-----------|--------|-------------|
| `magasin` | oui | Code magasin (`M02`…) |
| `token` | oui | `CAISSE_TICKET_TOKEN` |
| `lang` | non | `FR` (défaut) ou `AR` |
| `format` | non | **`json` (défaut)**, `txt`, `pdf`, `meta` |
| `encode` | non | avec `format=txt` : `base64` (recommandé WinDev, accents OK) |
| `date` | non | `YYYY-MM-DD` |

### Contenu métier (identique pour json / txt / pdf)

- Dernière commande **non vide** par fournisseur
- Date / tri : **`marque_prete_at`** du lot (validation « prête »), sinon `validated_at`, sinon `created_at`
- Statuts commande : `en_saisie`, `validee`, `integree`
- Groupé par catégorie ; lignes produit + qté + unité

---

## Solution A — Texte (`format=txt`) — la plus simple

```
GET …/commande-ticket?magasin=M02&token=…&format=txt&lang=FR
```

Réponse : binaire ESC/POS (64 col., bandeau fournisseur fond noir / texte blanc) + coupe.

| `lang` | Mode | Détail |
|--------|------|--------|
| `FR` | Texte ESC/POS | Windows-1252 / `ESC t 16` |
| `AR` | **Image** ESC/POS | Noto Sans Arabic (évite les pages de codes absentes → `#µ#`) |

**Accents FR** : encodage 1 octet (pas UTF-8).  
Si WinDev réécrit le fichier en UTF-8, utilisez `&encode=base64` + `DecodeBase64` avant `fWrite`.

### WinDev — ne pas bloquer l’UI

Évitez `iPrint` / `iPrintPDF` / `iConfigure` (dialogue ou attente spooler).  
Utilisez **fichier + `copy /b`** vers le **partage** imprimante, avec `exeNoWait` :

```wl
PROCEDURE ImprimerCommandeTicket(sCodeMagasin is string, sLangueimp is string)

sURL, sFichierTXT, sCmd are strings
cReq is httpRequest
cRep is httpResponse
nFic is int

IF sCodeMagasin ~= "" THEN
	Error("Code magasin manquant.")
	RETURN
END
IF sLangueimp ~= "" THEN sLangueimp = "FR"

sURL = gsUrlBackoffice + "/api/caisse/commande-ticket" + ...
	"?magasin=" + URLEncode(sCodeMagasin) + ...
	"&lang=" + URLEncode(sLangueimp) + ...
	"&format=txt&encode=base64" + ...
	"&token=" + URLEncode(gsCaisseTicketToken)

cReq.Method = httpGet
cReq.URL = sURL
cReq.ConnectionTimeout = 15s
cReq.Timeout = 60s
cRep = HTTPSend(cReq)
IF ErrorOccurred THEN
	Error("Erreur réseau : " + ErrorInfo())
	RETURN
END
IF cRep.StatusCode <> 200 THEN
	Error(StringBuild("API ticket HTTP %1", cRep.StatusCode))
	RETURN
END

// Décode base64 → buffer binaire (accents OK, ESC/POS OK)
bufTicket is Buffer = DecodeBase64(cRep.Content)

sFichierTXT = fTempPath() + ["\"] + "commande-" + sCodeMagasin + ".bin"
nFic = fOpen(sFichierTXT, foCreate + foWrite)
IF nFic = -1 THEN
	Error("Fichier temporaire impossible.")
	RETURN
END
fWrite(nFic, bufTicket)
fClose(nFic)

sCmd = "cmd /c copy /b """ + sFichierTXT + """ """ + gsImprimante_Ticket + """"
ExeRun(sCmd, exePID, exeNonBloquant)
```

> Adaptez `DecodeBase64` / `Buffer` à votre version WinDev (`Decode` + type binaire / `buf` selon l’aide).

---

## Solution B — JSON + état WinDev (`format=json`)

```
GET …/commande-ticket?magasin=M02&token=…&format=json&lang=FR
```

Exemple de structure :

```json
{
  "magasin": { "code": "M02", "nom": "O' Petit Frais 2" },
  "dateIso": "2026-07-25",
  "lang": "fr",
  "labels": { "title": "DERNIÈRE COMMANDE", "productCol": "Produit", "qtyCol": "Qté", "unitCol": "Unité" },
  "suppliers": [
    {
      "label": "Marché",
      "dateIso": "2026-07-25",
      "categories": [
        {
          "label": "Fruit",
          "lines": [
            { "name": "Banane", "qty": 5, "qtyLabel": "5", "unit": "Kg", "packaging": null }
          ]
        }
      ]
    }
  ]
}
```

### WinDev

1. `HTTPSend` → JSON  
2. Remplir un **état d’impression** (ou mémoire table) : rupture sur `suppliers.label` puis `categories.label`  
3. Imprimer avec **votre état ticket 80 mm** déjà au point (celui de `ticket.pdf`)

C’est le même chemin que vos tickets caisse qui s’impriment bien.

---

## Legacy PDF (`format=pdf`)

Conservé pour tests navigateur uniquement. Non recommandé en caisse.

---

## Catalogue produits (caisse Electron)

```
GET /api/caisse/catalog?token=…
```

Réponse JSON : `{ ok, products[], categories[], fetchedAt }` — produits actifs avec prix, UdV, catégorie, photo, noms arabes (`salesNameAr`, `categoryLabelAr`, `subcategoryLabelAr` si renseignés en base).

**Exclus du catalogue caisse** : catégorie `emballages_consommables` (emballages et consommables — gérés hors grille caisse).

Même token que `commande-ticket` (`CAISSE_TICKET_TOKEN`).

---

## Installateur caisse Windows (téléchargement sécurisé)

Même token `CAISSE_TICKET_TOKEN` que le catalogue.

| Route | Description |
|-------|-------------|
| `GET /api/caisse/release?token=…` | JSON : version, taille, `downloadUrl` |
| `GET /api/caisse/release/download?token=…` | Téléchargement direct (flux FTP ou fichier local) |

**Production** : installateur hébergé sur le FTP Janisol (`/POS/OPetitFrais-Caisse-Setup-{version}.exe`, ex. `OPetitFrais-Caisse-Setup-0.1.4.exe`), publié via `npm run upload:caisse-release` après `npm run dist:caisse`. L’API lit le fichier depuis le FTP (fallback sur l’ancien nom sans version) et le sert au client (token requis).

**Développement local** : si `apps/caisse/dist-win/OPetitFrais-Caisse-Setup-{version}.exe` existe, le backoffice sert le fichier sans FTP.

Variables :

| Variable | Rôle |
|----------|------|
| `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` | Accès FTP Janisol (déjà utilisés pour sync photos) |
| `CAISSE_RELEASE_FTP_DIR` | Dossier FTP (défaut `/POS`) |
| `CAISSE_RELEASE_FTP_FILE` | Nom du fichier sur le FTP (défaut `OPetitFrais-Caisse-Setup-{version}.exe`) |
| `CAISSE_RELEASE_PUBLIC_URL` | Optionnel : URL HTTPS directe fixe (legacy, une seule version) |
| `CAISSE_RELEASE_PUBLIC_BASE_URL` | **Recommandé prod** : base HTTPS du dossier FTP (ex. `https://opetitfrais.janisol.ma/POS`) — la caisse télécharge `{base}/OPetitFrais-Caisse-Setup-{version}.exe` sans proxy Vercel |
| `CAISSE_RELEASE_INSTALLER_PATH` | Chemin absolu local (dev / override) |
| `CAISSE_RELEASE_DOWNLOAD_NAME` | Override nom au téléchargement (sinon dérivé de la version caisse) |

Exemple de lien pour un poste magasin :

```
https://opetitfrais.janisol.ma/api/caisse/release/download?token=VOTRE_CAISSSE_TICKET_TOKEN
```

---

## Enregistrement poste caisse

Même token `CAISSE_TICKET_TOKEN`.

```
POST /api/caisse/poste/register?token=…
```

Corps JSON :

```json
{
  "posteId": "uuid-v4",
  "magasinCode": "1",
  "caisseCode": "2",
  "hostname": "poste-m02",
  "appVersion": "0.1.0"
}
```

| Règle | Détail |
|-------|--------|
| `caisseCode` | Entier **> 0** |
| `magasinCode` | `0` = magasin test (plusieurs postes autorisés) |
| Unicité | Un seul `(magasin, caisse)` en prod (hors magasin 0) |
| `posteId` | UUID stable par machine — ré-enregistrement autorisé pour le même ID |

Table Supabase : `caisse_postes` (migration `20260730160000_caisse_postes.sql`).

---

## Clients caisse (Electron)

```
GET /api/caisse/clients?token=…
POST /api/caisse/clients?token=…
PATCH /api/caisse/clients/[id]?token=…
```

Réponse GET : `{ ok, clients[], fetchedAt }` — clients actifs avec nom, téléphone, email, notes.

POST body : `{ name, phone?, email?, notes? }` → `{ ok, client }`.

PATCH body : `{ name?, phone?, email?, notes? }` → `{ ok, client }`.

Solde **Reste à régler** (`balanceDue`) : 0 tant que les ventes crédit ne sont pas synchronisées (Phase 3).

---

## Commandes boutique (workflow client)

Token identique (`CAISSE_TICKET_TOKEN`). Service role côté serveur.

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/caisse/commandes-boutique` | GET | Liste `a_passer_caisse` + état verrou |
| `/api/caisse/commandes-boutique/lock` | POST | Verrouiller pour ce poste |
| `/api/caisse/commandes-boutique/unlock` | POST | Libérer le verrou |
| `/api/caisse/commandes-boutique/link` | POST | Lier ticket POS (`shop_cart_pos_link`) + transition workflow |
| `/api/caisse/commandes-boutique/ticket` | GET | 2ᵉ ticket ESC/POS (check-list préparation + code-barres) |

Paramètres communs : `magasinCode`, `caisseCode`, `token`.

Backoffice workflow : [`../../commandes-client/README.md`](../../commandes-client/README.md).

---

## Config

```
CAISSE_TICKET_TOKEN=<secret>
```
