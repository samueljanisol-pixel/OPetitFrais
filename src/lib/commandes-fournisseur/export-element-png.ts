/** Capture un élément DOM en PNG et propose partage mobile ou téléchargement. */
import { getFontEmbedCSS, toBlob } from "html-to-image";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/whatsapp/url";
import { ensureArabicFontsReady } from "@/lib/fonts/noto-sans-arabic";

export async function captureElementToPngFile(
  element: HTMLElement,
  filename: string,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  try {
    await ensureArabicFontsReady();
    const fontEmbedCSS = await getFontEmbedCSS(element, { cacheBust: true });
    const blob = await toBlob(element, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      fontEmbedCSS,
      preferredFontFormat: "woff2",
    });
    if (!blob) {
      return { ok: false, error: "Impossible de générer l'image" };
    }

    const safeName = filename.replace(/[^\w\u0600-\u06FF\-]+/g, "_").slice(0, 80) || "commande.png";
    const file = new File([blob], safeName.endsWith(".png") ? safeName : `${safeName}.png`, {
      type: "image/png",
    });
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur export" };
  }
}

function downloadPngFile(file: File, downloadName?: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName ?? file.name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Suffixe horodaté pour éviter la demande « remplacer le fichier » à chaque envoi. */
export function uniquePngDownloadName(baseFilename: string): string {
  const withoutExt = baseFilename.replace(/\.png$/i, "");
  const safeBase = withoutExt.replace(/[^\w\u0600-\u06FF\-]+/g, "_").slice(0, 72) || "commande";
  return `${safeBase}-${Date.now()}.png`;
}

export function downloadPngFileUnique(file: File, baseFilename: string): void {
  downloadPngFile(file, uniquePngDownloadName(baseFilename));
}

export async function copyPngToClipboard(file: File): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
    return true;
  } catch {
    return false;
  }
}

export function canSharePngFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  return navigator.canShare?.({ files: [file] }) ?? false;
}

/** Partage natif de l’image (mobile) — même principe que « Exporter en image ». */
export async function sharePngFileNative(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canSharePngFile(file)) {
    return { ok: false, error: "Partage non disponible" };
  }
  try {
    await navigator.share({ files: [file], title: file.name });
    return { ok: true };
  } catch (shareErr) {
    if (shareErr instanceof Error && shareErr.name === "AbortError") {
      return { ok: true };
    }
    return { ok: false, error: shareErr instanceof Error ? shareErr.message : "Erreur partage" };
  }
}

export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const captured = await captureElementToPngFile(element, filename);
  if (!captured.ok) {
    return captured;
  }

  const { file } = captured;
  const shared = await sharePngFileNative(file);
  if (shared.ok) {
    return { ok: true };
  }

  downloadPngFile(file);
  return { ok: true };
}

/** URL wa.me vers le vendeur (comme le panier boutique). */
export function vendorWhatsAppHref(phone: string): string | null {
  if (!normalizeWhatsAppPhone(phone)) {
    return null;
  }
  return buildWhatsAppUrl(phone);
}
