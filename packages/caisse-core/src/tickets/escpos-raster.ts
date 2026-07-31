import { concatBytes } from "../format/bytes.js";
import {
  escPosSetAbsoluteHorizontalPosition,
  escPosSetAbsoluteVerticalPosition,
} from "./escpos-commands.js";

const GS = 0x1d;
const ESC = 0x1b;

/** Image 8-bit (0=noir) -> raster ESC/POS 1 bit (1=noir). */
export function packMonoRaster(raw: Uint8Array, width: number, height: number): Uint8Array {
  const widthBytes = Math.ceil(width / 8);
  const out = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = raw[y * width + x] ?? 255;
      if (lum < 128) {
        const bi = y * widthBytes + (x >> 3);
        out[bi] = (out[bi] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

/** GS v 0 — raster bitmap (mode 0, normal density). */
export function escPosRasterBitmap(
  raster: Uint8Array,
  widthPx: number,
  heightPx: number,
): Uint8Array {
  const widthBytes = Math.ceil(widthPx / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = heightPx & 0xff;
  const yH = (heightPx >> 8) & 0xff;
  return concatBytes([
    new Uint8Array([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    raster,
  ]);
}

/** Raster aligné à gauche (ESC a 0) puis retour alignement gauche. */
export function escPosLeftAlignedRaster(
  raster: Uint8Array,
  widthPx: number,
  heightPx: number,
): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x00]),
    escPosRasterBitmap(raster, widthPx, heightPx),
    new Uint8Array([0x0a]),
  ]);
}

/** Raster à une position absolue (mode page). */
export function escPosRasterAt(
  xDots: number,
  yDots: number,
  raster: Uint8Array,
  widthPx: number,
  heightPx: number,
): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x00]),
    escPosSetAbsoluteVerticalPosition(yDots),
    escPosSetAbsoluteHorizontalPosition(xDots),
    escPosRasterBitmap(raster, widthPx, heightPx),
  ]);
}

/** Raster centre (ESC a 1) puis retour alignement gauche. */
export function escPosCenteredRaster(
  raster: Uint8Array,
  widthPx: number,
  heightPx: number,
): Uint8Array {
  return concatBytes([
    new Uint8Array([ESC, 0x61, 0x01]),
    escPosRasterBitmap(raster, widthPx, heightPx),
    new Uint8Array([ESC, 0x61, 0x00]),
    new Uint8Array([0x0a]),
  ]);
}

export type MonoImageInput = {
  /** Pixels 8-bit greyscale, row-major. */
  rawGrey: Uint8Array;
  width: number;
  height: number;
};

export function escPosFromMonoImage(image: MonoImageInput): Uint8Array {
  const raster = packMonoRaster(image.rawGrey, image.width, image.height);
  return escPosCenteredRaster(raster, image.width, image.height);
}

/** Decoupe verticale si l'image depasse la hauteur max par chunk (limite memoire imprimante). */
export function escPosFromMonoImageStrips(
  image: MonoImageInput,
  stripHeight = 240,
): Uint8Array {
  const widthBytes = Math.ceil(image.width / 8);
  const fullRaster = packMonoRaster(image.rawGrey, image.width, image.height);
  const chunks: Uint8Array[] = [new Uint8Array([ESC, 0x61, 0x01])];

  for (let y0 = 0; y0 < image.height; y0 += stripHeight) {
    const h = Math.min(stripHeight, image.height - y0);
    const slice = new Uint8Array(widthBytes * h);
    for (let row = 0; row < h; row++) {
      slice.set(
        fullRaster.subarray((y0 + row) * widthBytes, (y0 + row + 1) * widthBytes),
        row * widthBytes,
      );
    }
    chunks.push(escPosRasterBitmap(slice, image.width, h));
  }

  chunks.push(new Uint8Array([ESC, 0x61, 0x00]), new Uint8Array([0x0a]));
  return concatBytes(chunks);
}
