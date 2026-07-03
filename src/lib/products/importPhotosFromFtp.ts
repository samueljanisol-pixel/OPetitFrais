import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "basic-ftp";
import sharp from "sharp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  FTP_ARCHIVE_NAME,
  FTP_REMOTE_DIR,
  normalizeProductCodeKey,
  productPhotoArchiveFileName,
} from "@/lib/products/product-photo-ftp";

const BUCKET = "product-photos";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export type ImportPhotosFromFtpResult = {
  ok: boolean;
  downloadedBytes: number;
  extractedFiles: number;
  uploaded: number;
  skippedNoProduct: number;
  skippedBadName: number;
  removedOld: number;
  errors: string[];
};

export type ImportPhotosFromFtpProgress = {
  phase: string;
  current?: number;
  total?: number;
};

export type ImportPhotosFromFtpOptions = {
  onProgress?: (progress: ImportPhotosFromFtpProgress) => void;
};

export type ExportPhotosToFtpResult = {
  ok: boolean;
  uploadedBytes: number;
  fileCount: number;
  errors: string[];
};

export type ExportPhotosToFtpProgress = {
  phase: string;
  current?: number;
  total?: number;
};

export type ExportPhotosToFtpOptions = {
  onProgress?: (progress: ExportPhotosToFtpProgress) => void;
};

function ftpEnv() {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  if (!host || !user || !password) throw new Error("FTP non configuré (FTP_HOST/FTP_USER/FTP_PASSWORD)");
  return { host, user, password };
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(full)));
    else out.push(full);
  }
  return out;
}

async function extractZipArchive(zipPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const JSZip = (await import("jszip")).default;
  const buf = await readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const content = await entry.async("nodebuffer");
    const target = path.join(outDir, entry.name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function resizeToJpeg100(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(100, 100, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function runImportProductPhotosFromFtp(
  options: ImportPhotosFromFtpOptions = {},
): Promise<ImportPhotosFromFtpResult> {
  const { onProgress } = options;
  const progress = (phase: string, current?: number, total?: number) => {
    onProgress?.({ phase, current, total });
  };

  const errors: string[] = [];
  let downloadedBytes = 0;
  let extractedFiles = 0;
  let uploaded = 0;
  let skippedNoProduct = 0;
  let skippedBadName = 0;
  let removedOld = 0;

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "opf-photos-"));
  const zipPath = path.join(tmpRoot, "photos.zip");
  const extractDir = path.join(tmpRoot, "extracted");

  try {
    progress("Connexion FTP");
    const { host, user, password } = ftpEnv();
    const ftp = new Client();
    await ftp.access({ host, user, password, secure: false });
    const remotePath = `${FTP_REMOTE_DIR}/${FTP_ARCHIVE_NAME}`;
    progress("Téléchargement de l’archive");
    await ftp.downloadTo(zipPath, remotePath);
    ftp.close();

    const st = await stat(zipPath);
    downloadedBytes = st.size;

    progress("Extraction de l’archive");
    await extractZipArchive(zipPath, extractDir);

    const allFiles = await walkFiles(extractDir);
    extractedFiles = allFiles.length;

    progress("Chargement des produits");
    const supabase = createSupabaseServiceRoleClient();

    const { data: products, error: pe } = await supabase.from("product").select("id, code, image_path");
    if (pe) {
      errors.push(pe.message);
      return {
        ok: false,
        downloadedBytes,
        extractedFiles,
        uploaded,
        skippedNoProduct,
        skippedBadName,
        removedOld,
        errors,
      };
    }

    if (!products?.length) {
      errors.push("Aucun produit en base.");
      return {
        ok: false,
        downloadedBytes,
        extractedFiles,
        uploaded,
        skippedNoProduct,
        skippedBadName,
        removedOld,
        errors,
      };
    }

    const byCode = new Map<string, { id: string; image_path: string | null }>();
    for (const row of products as Array<{ id: string; code: string; image_path: string | null }>) {
      const key = normalizeProductCodeKey(row.code);
      if (key) byCode.set(key, { id: row.id, image_path: row.image_path ?? null });
    }

    const imageFiles = allFiles.filter((filePath) => IMAGE_EXT.has(path.extname(filePath).toLowerCase()));
    let uploadIndex = 0;

    for (const filePath of imageFiles) {
      uploadIndex += 1;
      progress("Envoi des images", uploadIndex, imageFiles.length);

      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const key = normalizeProductCodeKey(base);
      if (!key) {
        skippedBadName++;
        continue;
      }

      const prod = byCode.get(key);
      if (!prod) {
        skippedNoProduct++;
        errors.push(`Aucun produit pour « ${path.basename(filePath)} » (code attendu ${key}).`);
        continue;
      }

      const storagePath = `products/${prod.id}/${Date.now()}.jpg`;
      const buf = await readFile(filePath);

      try {
        if (prod.image_path) {
          const { error: delErr } = await supabase.storage.from(BUCKET).remove([prod.image_path]);
          if (!delErr) removedOld++;
          else errors.push(`Suppression ancienne image (${key}): ${delErr.message}`);
        }

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
          contentType: mimeFromExt(ext),
          upsert: true,
        });
        if (upErr) {
          errors.push(`Upload ${key}: ${upErr.message}`);
          continue;
        }

        const { error: upProd } = await supabase.from("product").update({ image_path: storagePath }).eq("id", prod.id);
        if (upProd) {
          errors.push(`MAJ produit ${key}: ${upProd.message}`);
          await supabase.storage.from(BUCKET).remove([storagePath]);
          continue;
        }

        uploaded++;
        byCode.set(key, { id: prod.id, image_path: storagePath });
      } catch (e) {
        errors.push(`${path.basename(filePath)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      ok: uploaded > 0 || errors.length === 0,
      downloadedBytes,
      extractedFiles,
      uploaded,
      skippedNoProduct,
      skippedBadName,
      removedOld,
      errors,
    };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

export async function uploadProductPhotosZipToFtp(
  zipBuffer: Buffer,
  options: ExportPhotosToFtpOptions = {},
): Promise<ExportPhotosToFtpResult> {
  const { onProgress } = options;
  const progress = (phase: string, current?: number, total?: number) => {
    onProgress?.({ phase, current, total });
  };

  const errors: string[] = [];
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "opf-export-"));
  const zipPath = path.join(tmpRoot, FTP_ARCHIVE_NAME);

  try {
    await writeFile(zipPath, zipBuffer);
    progress("Connexion FTP");
    const { host, user, password } = ftpEnv();
    const ftp = new Client();
    await ftp.access({ host, user, password, secure: false });
    await ftp.ensureDir(FTP_REMOTE_DIR);
    progress("Envoi de l’archive");
    await ftp.uploadFrom(zipPath, `${FTP_REMOTE_DIR}/${FTP_ARCHIVE_NAME}`);
    ftp.close();

    return {
      ok: true,
      uploadedBytes: zipBuffer.byteLength,
      fileCount: 0,
      errors,
    };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return {
      ok: false,
      uploadedBytes: 0,
      fileCount: 0,
      errors,
    };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runExportProductPhotosToFtp(
  options: ExportPhotosToFtpOptions = {},
): Promise<ExportPhotosToFtpResult> {
  const { onProgress } = options;
  const progress = (phase: string, current?: number, total?: number) => {
    onProgress?.({ phase, current, total });
  };

  const errors: string[] = [];
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "opf-export-"));
  const workDir = path.join(tmpRoot, "images");
  const zipPath = path.join(tmpRoot, FTP_ARCHIVE_NAME);

  try {
    progress("Chargement des produits");
    const supabase = createSupabaseServiceRoleClient();
    const { data: products, error: pe } = await supabase
      .from("product")
      .select("id, code, image_path")
      .not("image_path", "is", null)
      .order("code");

    if (pe) {
      errors.push(pe.message);
      return { ok: false, uploadedBytes: 0, fileCount: 0, errors };
    }

    const rows = (products ?? []) as Array<{ id: string; code: string; image_path: string | null }>;
    if (rows.length === 0) {
      errors.push("Aucune photo produit à exporter.");
      return { ok: false, uploadedBytes: 0, fileCount: 0, errors };
    }

    await mkdir(workDir, { recursive: true });
    let index = 0;
    let fileCount = 0;

    for (const row of rows) {
      index += 1;
      progress("Préparation des images", index, rows.length);
      const archiveName = productPhotoArchiveFileName(row.code);
      if (!archiveName || !row.image_path) continue;

      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(row.image_path);
      if (dlErr || !blob) {
        errors.push(`Téléchargement ${row.code}: ${dlErr?.message ?? "fichier absent"}`);
        continue;
      }

      const buf = Buffer.from(await blob.arrayBuffer());
      const jpg = await resizeToJpeg100(buf);
      await writeFile(path.join(workDir, archiveName), jpg);
      fileCount += 1;
    }

    if (fileCount === 0) {
      errors.push("Aucune image n’a pu être préparée.");
      return { ok: false, uploadedBytes: 0, fileCount: 0, errors };
    }

    progress("Création de l’archive");
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const files = await readdir(workDir);
    for (const name of files) {
      const content = await readFile(path.join(workDir, name));
      zip.file(name, content);
    }
    const zipBuffer = Buffer.from(
      await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }),
    );

    const uploadResult = await uploadProductPhotosZipToFtp(zipBuffer, {
      onProgress: (p) => progress(p.phase, p.current, p.total),
    });

    return {
      ok: uploadResult.ok,
      uploadedBytes: uploadResult.uploadedBytes,
      fileCount,
      errors: [...errors, ...uploadResult.errors],
    };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { ok: false, uploadedBytes: 0, fileCount: 0, errors };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
