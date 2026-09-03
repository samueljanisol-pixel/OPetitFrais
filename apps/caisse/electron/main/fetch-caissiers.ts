import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { loadRuntimeConfig } from "./load-config";
import type { CachedCaissier, CaisseCaissierPublic, CaisseCaissiersPayload } from "../../shared/caisse-session";

type DiskCaissiersCache = {
  magasinCode: string;
  caissiers: CachedCaissier[];
  fetchedAt: string;
  savedAt: string;
};

type ApiCaissiersResponse = {
  ok: boolean;
  caissiers?: CachedCaissier[];
  fetchedAt?: string;
  error?: string;
};

let cached: DiskCaissiersCache | null = null;

function cachePath(): string {
  return join(app.getPath("userData"), "caissiers-cache.json");
}

function parseCachedList(raw: unknown): CachedCaissier[] {
  if (!Array.isArray(raw)) return [];
  const out: CachedCaissier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const userId = typeof row.userId === "string" ? row.userId.trim() : "";
    const pinHash = typeof row.pinHash === "string" ? row.pinHash.trim() : "";
    if (!userId || !pinHash) continue;
    out.push({
      userId,
      prenom: typeof row.prenom === "string" ? row.prenom : "",
      nom: typeof row.nom === "string" ? row.nom : "",
      pinHash,
    });
  }
  return out;
}

function loadDisk(): DiskCaissiersCache | null {
  try {
    const path = cachePath();
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DiskCaissiersCache;
    const caissiers = parseCachedList(parsed.caissiers);
    if (caissiers.length === 0) return null;
    return {
      magasinCode: typeof parsed.magasinCode === "string" ? parsed.magasinCode : "",
      caissiers,
      fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

function saveDisk(magasinCode: string, caissiers: CachedCaissier[], fetchedAt: string): void {
  try {
    const payload: DiskCaissiersCache = {
      magasinCode,
      caissiers,
      fetchedAt,
      savedAt: new Date().toISOString(),
    };
    writeFileSync(cachePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    // ignore write errors
  }
}

function toPublic(list: CachedCaissier[]): CaisseCaissierPublic[] {
  return list.map((c) => ({
    userId: c.userId,
    prenom: c.prenom,
    nom: c.nom,
  }));
}

function payloadFromList(
  list: CachedCaissier[],
  source: CaisseCaissiersPayload["source"],
  fetchedAt: string | null,
  error: string | null,
): CaisseCaissiersPayload {
  return {
    caissiers: toPublic(list),
    error,
    source,
    fetchedAt,
  };
}

function fallbackToDisk(networkError: string): CaisseCaissiersPayload {
  const disk = loadDisk();
  if (disk) {
    cached = disk;
    return payloadFromList(disk.caissiers, "cache", disk.fetchedAt, null);
  }
  return payloadFromList([], "none", null, networkError);
}

async function readJsonResponse(res: Response): Promise<ApiCaissiersResponse | { ok: false; error: string }> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    return {
      ok: false,
      error:
        res.status === 404
          ? "API caissiers introuvable — le backoffice n'a pas encore cette route"
          : "Réponse backoffice invalide (page HTML au lieu de JSON)",
    };
  }
  try {
    return JSON.parse(text) as ApiCaissiersResponse;
  } catch {
    return { ok: false, error: `Réponse caissiers invalide (HTTP ${res.status})` };
  }
}

export function getCachedCaissiersInternal(): CachedCaissier[] {
  if (cached && cached.caissiers.length > 0) return cached.caissiers;
  const disk = loadDisk();
  if (disk) {
    cached = disk;
    return disk.caissiers;
  }
  return [];
}

export function findCachedCaissier(userId: string): CachedCaissier | null {
  const id = userId.trim();
  return getCachedCaissiersInternal().find((c) => c.userId === id) ?? null;
}

export async function prefetchCaissiers(force = false): Promise<CaisseCaissiersPayload> {
  if (!force && cached && cached.caissiers.length > 0) {
    return payloadFromList(cached.caissiers, "cache", cached.fetchedAt, null);
  }

  const config = loadRuntimeConfig();
  if (!config.caisseToken.trim() || !config.magasinCode.trim()) {
    const disk = loadDisk();
    if (disk) {
      cached = disk;
      return payloadFromList(disk.caissiers, "cache", disk.fetchedAt, null);
    }
    return payloadFromList([], "none", null, "Token ou magasin introuvable");
  }

  try {
    const url = `${config.backofficeUrl.replace(/\/$/, "")}/api/caisse/caissiers?token=${encodeURIComponent(config.caisseToken)}&magasin=${encodeURIComponent(config.magasinCode)}`;
    const res = await fetch(url);
    const json = await readJsonResponse(res);
    if (!res.ok || !json.ok || !("caissiers" in json) || !Array.isArray(json.caissiers)) {
      return fallbackToDisk(json.error ?? `HTTP ${res.status}`);
    }
    const list = parseCachedList(json.caissiers);

    const fetchedAt = json.fetchedAt ?? new Date().toISOString();
    saveDisk(config.magasinCode, list, fetchedAt);
    cached = {
      magasinCode: config.magasinCode,
      caissiers: list,
      fetchedAt,
      savedAt: new Date().toISOString(),
    };
    return payloadFromList(list, "network", fetchedAt, null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return fallbackToDisk(msg);
  }
}

export function getCachedCaissiers(): CaisseCaissiersPayload {
  if (cached && cached.caissiers.length > 0) {
    return payloadFromList(cached.caissiers, "cache", cached.fetchedAt, null);
  }
  const disk = loadDisk();
  if (disk) {
    cached = disk;
    return payloadFromList(disk.caissiers, "cache", disk.fetchedAt, null);
  }
  return payloadFromList([], "none", null, "Aucun caissier en cache — connectez la caisse une fois");
}

export function clearCachedCaissiers(): void {
  cached = null;
}
