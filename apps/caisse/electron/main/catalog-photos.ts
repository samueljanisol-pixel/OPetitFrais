import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { pathToFileURL } from "url";
import { app, net, protocol } from "electron";
import type { CatalogProduct } from "@opf/caisse-core";

const SCHEME = "caisse-photo";
const DOWNLOAD_CONCURRENCY = 6;

function photosDir(): string {
  return join(app.getPath("userData"), "catalog-photos");
}

function photoHash(remoteUrl: string): string {
  return createHash("sha1").update(remoteUrl).digest("hex");
}

function extFromUrl(remoteUrl: string): string {
  try {
    const pathname = new URL(remoteUrl).pathname;
    const ext = extname(pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext;
  } catch {
    // ignore
  }
  return ".jpg";
}

function localPhotoFile(remoteUrl: string): string {
  return join(photosDir(), `${photoHash(remoteUrl)}${extFromUrl(remoteUrl)}`);
}

/** URL locale servie via protocole custom (disponible hors ligne). */
export function localPhotoProtocolUrl(remoteUrl: string): string {
  const hash = photoHash(remoteUrl);
  const ext = extFromUrl(remoteUrl).replace(/^\./, "");
  return `${SCHEME}://local/${hash}.${ext}`;
}

function filePathFromProtocolUrl(requestUrl: string): string | null {
  try {
    const u = new URL(requestUrl);
    const name = u.pathname.replace(/^\/+/, "");
    if (!/^[a-f0-9]{40}\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return null;
    return join(photosDir(), name);
  } catch {
    return null;
  }
}

export function registerCatalogPhotoProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function handleCatalogPhotoProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    const filePath = filePathFromProtocolUrl(request.url);
    if (!filePath || !existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).href);
  });
}

function isRemoteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function applyLocalPhotoUrls(products: CatalogProduct[]): CatalogProduct[] {
  return products.map((product) => {
    const remote = product.photoUrl;
    if (!remote || !isRemoteHttpUrl(remote)) return product;
    if (!existsSync(localPhotoFile(remote))) return product;
    return { ...product, photoUrl: localPhotoProtocolUrl(remote) };
  });
}

async function downloadOne(remoteUrl: string): Promise<boolean> {
  const dest = localPhotoFile(remoteUrl);
  if (existsSync(dest)) return true;

  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return false;
    mkdirSync(photosDir(), { recursive: true });
    writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

/** Télécharge les photos manquantes (concurrence limitée). */
export async function cacheCatalogPhotos(products: CatalogProduct[]): Promise<number> {
  const urls = [
    ...new Set(
      products
        .map((p) => p.photoUrl)
        .filter((url): url is string => typeof url === "string" && isRemoteHttpUrl(url)),
    ),
  ];

  const missing = urls.filter((url) => !existsSync(localPhotoFile(url)));
  if (missing.length === 0) return 0;

  mkdirSync(photosDir(), { recursive: true });

  let saved = 0;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < missing.length) {
      const current = missing[index]!;
      index += 1;
      if (await downloadOne(current)) saved += 1;
    }
  }

  const workers = Array.from(
    { length: Math.min(DOWNLOAD_CONCURRENCY, missing.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return saved;
}
