/**
 * Génère apps/caisse/build/icon.png (fond noir/blanc → transparent, min 256×256).
 */
import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "build", "icon-source.png");
const output = path.join(root, "build", "icon.png");
const ICON_SIZE = 256;
const THRESHOLD = 40;

if (!existsSync(source)) {
  console.error(`Source introuvable : ${source}`);
  process.exit(1);
}

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i] ?? 0;
  const g = data[i + 1] ?? 0;
  const b = data[i + 2] ?? 0;
  const isDark = r <= THRESHOLD && g <= THRESHOLD && b <= THRESHOLD;
  const isLight = r >= 250 && g >= 250 && b >= 250;
  if (isDark || isLight) {
    data[i + 3] = 0;
  }
}

await sharp(data, {
  raw: {
    width: info.width,
    height: info.height,
    channels: 4,
  },
})
  .resize(ICON_SIZE, ICON_SIZE, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(output);

console.log(`Icône caisse → ${output} (${ICON_SIZE}x${ICON_SIZE}, fond transparent)`);
