/**
 * Release caisse : bump version (optionnel) + build installateur + upload FTP.
 *
 * Usage :
 *   npm run release:caisse              # version actuelle de apps/caisse/package.json
 *   npm run release:caisse -- patch     # 0.1.0 → 0.1.1
 *   npm run release:caisse -- minor       # 0.1.0 → 0.2.0
 *   npm run release:caisse -- major       # 0.1.0 → 1.0.0
 *   npm run release:caisse -- 0.2.0       # version explicite
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CAISSE_PKG = path.join(process.cwd(), "apps", "caisse", "package.json");
const STOP_SCRIPT = path.join(process.cwd(), "apps", "caisse", "scripts", "stop-caisse-processes.mjs");

type SemverParts = { major: number; minor: number; patch: number };

function parseSemver(raw: string): SemverParts | null {
  const match = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
  };
}

function formatSemver(parts: SemverParts): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

function resolveNextVersion(current: string, arg: string | undefined): string {
  if (!arg?.trim()) return current;

  const explicit = parseSemver(arg);
  if (explicit && /^\d+\.\d+\.\d+/.test(arg.trim())) {
    return formatSemver(explicit);
  }

  const base = parseSemver(current);
  if (!base) {
    throw new Error(`Version caisse invalide : ${current}`);
  }

  switch (arg.trim().toLowerCase()) {
    case "patch":
      return formatSemver({ ...base, patch: base.patch + 1 });
    case "minor":
      return formatSemver({ major: base.major, minor: base.minor + 1, patch: 0 });
    case "major":
      return formatSemver({ major: base.major + 1, minor: 0, patch: 0 });
    default:
      throw new Error(`Argument version inconnu : ${arg} (patch | minor | major | x.y.z)`);
  }
}

function readCaisseVersion(): string {
  const pkg = JSON.parse(readFileSync(CAISSE_PKG, "utf8")) as { version?: string };
  if (typeof pkg.version !== "string" || !pkg.version.trim()) {
    throw new Error("apps/caisse/package.json : version manquante");
  }
  return pkg.version.trim();
}

function writeCaisseVersion(version: string): void {
  const pkg = JSON.parse(readFileSync(CAISSE_PKG, "utf8")) as Record<string, unknown>;
  pkg.version = version;
  writeFileSync(CAISSE_PKG, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function run(command: string, env?: NodeJS.ProcessEnv): void {
  execSync(command, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, ...env },
  });
}

function stopCaisseBeforeRelease(): void {
  console.log("→ Fermeture caisse / preview / Electron…");
  execSync(`node "${STOP_SCRIPT}"`, { stdio: "inherit", cwd: process.cwd() });
}

function main(): void {
  const bumpArg = process.argv[2];
  const current = readCaisseVersion();
  const next = resolveNextVersion(current, bumpArg);

  stopCaisseBeforeRelease();

  if (next !== current) {
    writeCaisseVersion(next);
    console.log(`Version caisse : ${current} → ${next}`);
  } else {
    console.log(`Version caisse : ${next}`);
  }

  console.log("");
  console.log("→ Build installateur Windows…");
  run("npm run dist:caisse", { OPF_RELEASE_BUILD: "1" });

  console.log("");
  console.log("→ Upload FTP /POS…");
  run("npm run upload:caisse-release");

  console.log("");
  console.log("OK — release caisse terminée.");
  console.log(`Version API (apps/caisse/package.json) : ${next}`);
  console.log("Pensez à commit + push pour que Vercel serve la même version.");
}

main();
