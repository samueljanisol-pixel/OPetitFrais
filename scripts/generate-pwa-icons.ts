/**
 * Icônes PWA / Android : logo centré sur canvas carré à fond transparent.
 * Si le PNG n’a pas d’alpha mais un fond noir uniforme (export courant), les pixels
 * très sombres « neutres » sont rendus transparents avant composition.
 *
 * Source : `public/logo-opetitfrais.png` (remplacer puis `npm run icons:pwa`).
 */

import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGO = resolve(ROOT, "public/logo-opetitfrais.png");
const OUT_DIR = resolve(ROOT, "public/icons");

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Détecte un fond opaque quasi noir sans découper les rouges/verts du logo */
function shouldKeyOutBlackBackground(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx > 28) return false;
  if (mx - mn > 14) return false;
  return true;
}

async function prepareLogoPng(): Promise<Buffer> {
  const meta = await sharp(LOGO).metadata();
  if (!meta.width || !meta.height) throw new Error("Dimensions logo invalides");

  if (meta.hasAlpha) {
    return sharp(LOGO).png().toBuffer();
  }

  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (shouldKeyOutBlackBackground(r, g, b)) {
      data[i + 3] = 0;
    }
  }

  return sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function makeSquareIcon(logoPng: Buffer, size: number, logoMax: number, outFile: string) {
  const resized = await sharp(logoPng)
    .resize({
      width: logoMax,
      height: logoMax,
      fit: "inside",
      withoutEnlargement: false,
    })
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(outFile);
}

async function main() {
  const logoPng = await prepareLogoPng();

  await makeSquareIcon(logoPng, 512, 380, resolve(OUT_DIR, "icon-512.png"));
  await makeSquareIcon(logoPng, 192, 142, resolve(OUT_DIR, "icon-192.png"));
  await makeSquareIcon(logoPng, 512, 300, resolve(OUT_DIR, "icon-512-maskable.png"));
  await makeSquareIcon(logoPng, 192, 112, resolve(OUT_DIR, "icon-192-maskable.png"));

  console.log("Icônes PWA générées → public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
