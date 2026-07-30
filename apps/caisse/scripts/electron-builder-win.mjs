import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = path.join(root, ".dist-output");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = typeof pkg.version === "string" ? pkg.version.trim() : "0.0.0";

let outputDir = "dist-win";
try {
  const raw = readFileSync(marker, "utf8").trim();
  if (raw) outputDir = raw;
} catch {
  /* predist pas exécuté */
}

const args = ["electron-builder", "--win", `--config.directories.output=${outputDir}`];

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const installerName = `OPetitFrais-Caisse-Setup-${version}.exe`;
console.log("");
console.log(`Installateur : ${path.join(root, outputDir, installerName)}`);
