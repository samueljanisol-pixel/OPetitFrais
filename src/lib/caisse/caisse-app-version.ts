import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cachedVersion: string | null = null;

/** Version publiée de l'app caisse — source : apps/caisse/package.json (override : CAISSE_RELEASE_VERSION). */
export function getCaisseAppVersion(): string {
  if (cachedVersion) return cachedVersion;

  const envOverride = process.env.CAISSE_RELEASE_VERSION?.trim();
  if (envOverride) {
    cachedVersion = envOverride;
    return cachedVersion;
  }

  const pkgPath = path.join(process.cwd(), "apps", "caisse", "package.json");
  try {
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown };
      if (typeof pkg.version === "string" && pkg.version.trim().length > 0) {
        cachedVersion = pkg.version.trim();
        return cachedVersion;
      }
    }
  } catch {
    /* fallback */
  }

  cachedVersion = "0.1.0";
  return cachedVersion;
}
