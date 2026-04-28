import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "basic-ftp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const execFileAsync = promisify(execFile);

const BUCKET = "product-photos";
const FTP_REMOTE_DIR = "/img_produits";
const FTP_RAR_NAME = "Photos_Produits.rar";

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

function ftpEnv() {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  if (!host || !user || !password) throw new Error("FTP non configuré (FTP_HOST/FTP_USER/FTP_PASSWORD)");
  return { host, user, password };
}

function normalizeCodeKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n).padStart(6, "0");
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

async function executableFileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Extrait un .rar via UnRAR ou 7-Zip (hors processus Node — binaire sur l’hôte).
 * - Windows : chemins d’installation par défaut testés en priorité (souvent absent du PATH).
 * - UNRAR_PATH : exécutable UnRAR.exe (WinRAR) ou équivalent.
 * - SEVENZIP_PATH : chemin complet vers 7z.exe si non dans le PATH.
 */
async function extractRarArchive(rarPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const attempts: Array<{ bin: string; args: string[] }> = [];
  const pushUnrar = (bin: string) => {
    attempts.push({ bin, args: ["x", "-o+", "-y", rarPath, `${outDir}${path.sep}`] });
    attempts.push({ bin, args: ["x", "-y", "-o+", rarPath, outDir] });
  };
  const push7z = (bin: string) => {
    attempts.push({ bin, args: ["x", "-y", `-o${outDir}`, rarPath] });
  };

  const customUnrar = process.env.UNRAR_PATH?.trim();
  if (customUnrar) pushUnrar(customUnrar);

  const custom7z = process.env.SEVENZIP_PATH?.trim();
  if (custom7z) push7z(custom7z);

  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    const pfx86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const win7z = [
      path.join(pf, "7-Zip", "7z.exe"),
      path.join(pfx86, "7-Zip", "7z.exe"),
    ];
    const winUnrar = [
      path.join(pf, "WinRAR", "UnRAR.exe"),
      path.join(pfx86, "WinRAR", "UnRAR.exe"),
    ];
    for (const p of win7z) {
      if (await executableFileExists(p)) {
        push7z(p);
        break;
      }
    }
    for (const p of winUnrar) {
      if (await executableFileExists(p)) {
        pushUnrar(p);
        break;
      }
    }
  }

  pushUnrar("unrar");
  push7z("7z");
  push7z("7zz");

  let last: unknown;
  for (const { bin, args } of attempts) {
    try {
      await execFileAsync(bin, args, {
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      });
      return;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(
    [
      "Extraction RAR impossible sur cette machine.",
      "Installez 7-Zip (emplacement par défaut « Program Files\\7-Zip ») ou WinRAR, ajoutez 7z.exe au PATH, ou définissez la variable d’environnement SEVENZIP_PATH (chemin vers 7z.exe) ou UNRAR_PATH (UnRAR.exe).",
      `Détail technique : ${last instanceof Error ? last.message : String(last)}`,
    ].join(" "),
  );
}

export async function runImportProductPhotosFromFtp(): Promise<ImportPhotosFromFtpResult> {
  const errors: string[] = [];
  let downloadedBytes = 0;
  let extractedFiles = 0;
  let uploaded = 0;
  let skippedNoProduct = 0;
  let skippedBadName = 0;
  let removedOld = 0;

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "opf-photos-"));
  const rarPath = path.join(tmpRoot, "photos.rar");
  const extractDir = path.join(tmpRoot, "extracted");

  try {
    const { host, user, password } = ftpEnv();
    const ftp = new Client();
    await ftp.access({ host, user, password, secure: false });
    const remotePath = `${FTP_REMOTE_DIR}/${FTP_RAR_NAME}`;
    await ftp.downloadTo(rarPath, remotePath);
    ftp.close();

    const st = await stat(rarPath);
    downloadedBytes = st.size;

    await extractRarArchive(rarPath, extractDir);

    const allFiles = await walkFiles(extractDir);
    extractedFiles = allFiles.length;

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
      const key = normalizeCodeKey(row.code);
      if (key) byCode.set(key, { id: row.id, image_path: row.image_path ?? null });
    }

    for (const filePath of allFiles) {
      const ext = path.extname(filePath);
      if (!IMAGE_EXT.has(ext.toLowerCase())) continue;

      const base = path.basename(filePath, ext);
      const key = normalizeCodeKey(base);
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

      const safeExt = ext.replace(/^\./, "").toLowerCase();
      const safe =
        safeExt === "jpeg"
          ? "jpg"
          : ["jpg", "png", "webp", "gif"].includes(safeExt)
            ? safeExt
            : "jpg";
      const storagePath = `products/${prod.id}/${Date.now()}.${safe}`;
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
