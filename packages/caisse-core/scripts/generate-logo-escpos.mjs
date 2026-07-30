/**
 * Genere src/tickets/logo-opetit-frais-escpos.ts depuis le PNG caisse.
 * Usage (racine monorepo) : node packages/caisse-core/scripts/generate-logo-escpos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.join(__dirname, "..");
const logoPath = path.join(coreRoot, "..", "..", "apps", "caisse", "src", "assets", "logo-opetit-frais.png");
const outPath = path.join(coreRoot, "src", "tickets", "logo-opetit-frais-escpos.ts");

const TARGET_WIDTH = 384;

function packMonoRaster(raw, width, height) {
  const widthBytes = Math.ceil(width / 8);
  const out = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = raw[y * width + x] ?? 255;
      if (lum < 160) {
        const bi = y * widthBytes + (x >> 3);
        out[bi] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

const { data, info } = await sharp(logoPath)
  .resize(TARGET_WIDTH, null, { fit: "inside", withoutEnlargement: false })
  .flatten({ background: "#ffffff" })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const raster = packMonoRaster(data, info.width, info.height);
const greyCopy = Buffer.from(data);

const ts = `/** Logo O'petit frais — raster ESC/POS pre-genere (ne pas editer a la main). */
export const OPF_LOGO_GREY_RAW = new Uint8Array(${JSON.stringify([...greyCopy])});
export const OPF_LOGO_WIDTH = ${info.width};
export const OPF_LOGO_HEIGHT = ${info.height};
export const OPF_LOGO_RASTER = new Uint8Array(${JSON.stringify([...raster])});
`;

fs.writeFileSync(outPath, ts, "utf8");
console.log(`Logo ESC/POS genere : ${info.width}x${info.height}px -> ${outPath}`);
