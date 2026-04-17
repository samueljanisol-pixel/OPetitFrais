/**
 * Lecture des champs des fichiers `ventes_*.json` (FTP / caisses).
 * Partagé entre la sync Supabase et l’API stream.
 */

export function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickString(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export function extractProductLines(payload: unknown): Array<{ name: string; ca: number; qty: number }> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const out: Array<{ name: string; ca: number; qty: number }> = [];

  const ventes = root["ventes"];
  if (ventes && typeof ventes === "object" && !Array.isArray(ventes)) {
    for (const v of Object.values(ventes as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      const name = pickString(r.article) || pickString(r.libelle) || pickString(r.designation) || pickString(r.name);
      const qty = asNumber(r.qte) || asNumber(r.qty) || asNumber(r.quantite) || asNumber(r.quantity);
      const ca = asNumber(r.total) || asNumber(r.ca) || asNumber(r.montant) || asNumber(r.amount) || asNumber(r.total_ttc);
      if (!name) continue;
      if (qty === 0 && ca === 0) continue;
      out.push({ name, ca, qty });
    }
  }

  return out;
}

export function extractNbPaniers(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0;
  const r = parsed as Record<string, unknown>;
  const n =
    asNumber(r.nb_paniers) ||
    asNumber(r.nbPaniers) ||
    asNumber(r.nombre_paniers) ||
    asNumber(r.NbrPanier) ||
    asNumber(r.nbr_panier);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function hourIndexFromUnknown(h: unknown): number | null {
  if (h == null) return null;
  if (typeof h === "number" && Number.isFinite(h) && h >= 0 && h < 48) return Math.trunc(h);
  const s = String(h).trim();
  const m = s.match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0 || n >= 48) return null;
  return Math.trunc(n);
}

/** Première propriété dont le nom correspond (insensible à la casse), ex. `Heure` / `heure`. */
function recordGetCI(o: Record<string, unknown>, ...names: string[]): unknown {
  const byLower = new Map<string, string>();
  for (const k of Object.keys(o)) byLower.set(k.toLowerCase(), k);
  for (const name of names) {
    const key = byLower.get(name.toLowerCase());
    if (key !== undefined) return o[key];
  }
  return undefined;
}

function panierCountFromRecord(o: Record<string, unknown>): number {
  const v = recordGetCI(
    o,
    "nbrpanier",
    "nbpanier",
    "nb_panier",
    "nb_paniers",
    "nb",
    "nombre",
    "nbr",
    "count",
    "paniers",
    "qty",
    "quantite",
    "value",
    "total",
    "valeur",
  );
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function hourIndexFromRecord(o: Record<string, unknown>): number | null {
  const hRaw = recordGetCI(o, "heure", "hour", "h", "tranche", "creneau", "indice", "index");
  if (hRaw != null) {
    const d = hourIndexFromUnknown(hRaw);
    if (d != null) return d;
  }
  const label = recordGetCI(o, "libelle", "label", "plage", "name");
  if (typeof label === "string") return hourIndexFromUnknown(label);
  return null;
}

function bucketsFromHourPairs(pairs: Array<{ idx: number; v: number }>): number[] {
  if (!pairs.length) return [];
  const byIdx = new Map<number, number>();
  for (const { idx, v } of pairs) {
    byIdx.set(idx, (byIdx.get(idx) ?? 0) + v);
  }
  const sorted = [...byIdx.entries()].sort((a, b) => a[0] - b[0]);
  const maxIdx = sorted[sorted.length - 1]![0];
  const out = new Array(maxIdx + 1).fill(0);
  for (const [idx, v] of sorted) out[idx] = v;
  return out;
}

/**
 * Nombre de paniers par tranche horaire (`panier_heure` dans les JSON jour).
 * Tableau de nombres : index = heure. Tableau d'objets : champs heure + nb (ou variantes).
 * Objet : clés numériques ou texte contenant une heure (ex. "8", "08h-09h").
 */
export function extractPanierHeureBuckets(parsed: unknown): number[] {
  if (!parsed || typeof parsed !== "object") return [];
  const r = parsed as Record<string, unknown>;
  const raw =
    r.panier_heure ?? r.panierHeure ?? r.panier_par_heure ?? r.paniers_heure ?? r.panier_heures;
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    const first = raw[0];
    if (typeof first === "number" || typeof first === "string") {
      return raw.map((x) => {
        const n = typeof x === "number" ? x : Number(x);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
      });
    }
    const pairs: Array<{ idx: number; v: number }> = [];
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const idx = hourIndexFromRecord(o);
      if (idx == null) continue;
      const v = panierCountFromRecord(o);
      if (v <= 0) continue;
      pairs.push({ idx, v });
    }
    return bucketsFromHourPairs(pairs);
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const pairs: Array<{ idx: number; v: number }> = [];
    for (const [k, val] of Object.entries(o)) {
      let idx = Number(k);
      if (!Number.isFinite(idx) || idx < 0) {
        const m = k.match(/(\d{1,2})/);
        if (!m) continue;
        idx = Number(m[1]);
      }
      if (!Number.isFinite(idx) || idx < 0 || idx >= 48) continue;
      const n = asNumber(val);
      if (!Number.isFinite(n) || n < 0) continue;
      pairs.push({ idx, v: Math.round(n) });
    }
    if (!pairs.length) {
      return Object.values(o).map((v) => {
        const n = asNumber(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
      });
    }
    return bucketsFromHourPairs(pairs);
  }

  return [];
}

/** Somme terme à terme (agrégation multi-caisses). */
export function mergePanierHeureBuckets(existing: number[] | undefined, add: number[]): number[] {
  if (!add.length) return existing ? [...existing] : [];
  if (!existing || !existing.length) return [...add];
  const len = Math.max(existing.length, add.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) out[i] = (existing[i] ?? 0) + (add[i] ?? 0);
  return out;
}

export function extractTotalJourFromJson(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0;
  const r = parsed as Record<string, unknown>;
  if (!("total_jour" in r)) return 0;
  return asNumber(r.total_jour);
}

export function extractMonthCaFromJson(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") return 0;
  const r = parsed as Record<string, unknown>;
  const fromRoot =
    asNumber(r.total_mois) || asNumber(r.totalMois) || asNumber(r.ca_mois) || asNumber(r.total_mois_ht);
  if (fromRoot > 0) return fromRoot;
  const lines = extractProductLines(parsed);
  if (!lines.length) return 0;
  return lines.reduce((acc, l) => acc + (Number.isFinite(l.ca) ? l.ca : 0), 0);
}

export function parseVentesJsonRaw(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
