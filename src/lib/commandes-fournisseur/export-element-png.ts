/** Capture un élément DOM en PNG et propose partage mobile ou téléchargement. */
import { buildWhatsAppUrl, normalizeWhatsAppPhone, openWhatsAppChat } from "@/lib/whatsapp/url";

async function captureElementToPngFile(
  element: HTMLElement,
  filename: string,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const w = Math.ceil(element.scrollWidth);
    const h = Math.ceil(element.scrollHeight);
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
    });
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png", 1);
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

function downloadPngFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyPngToClipboard(file: File): Promise<boolean> {
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

export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const captured = await captureElementToPngFile(element, filename);
  if (!captured.ok) {
    return captured;
  }

  const { file } = captured;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        return { ok: true };
      }
    } catch (shareErr) {
      if (shareErr instanceof Error && shareErr.name === "AbortError") {
        return { ok: true };
      }
    }
  }

  downloadPngFile(file);
  return { ok: true };
}

/** Ouvre la conversation WhatsApp du vendeur et propose l’image (partage natif, presse-papiers ou téléchargement). */
export async function shareVendorOrderWhatsApp({
  element,
  filename,
  phone,
  waWindow,
}: {
  element: HTMLElement;
  filename: string;
  phone: string;
  waWindow?: Window | null;
}): Promise<{ ok: true; imageShared: boolean } | { ok: false; error: string }> {
  if (!normalizeWhatsAppPhone(phone)) {
    return { ok: false, error: "Numéro invalide" };
  }

  const captured = await captureElementToPngFile(element, filename);
  if (!captured.ok) {
    return captured;
  }

  const { file } = captured;
  let imageShared = false;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        imageShared = true;
      }
    } catch (shareErr) {
      if (shareErr instanceof Error && shareErr.name === "AbortError") {
        return { ok: true, imageShared: false };
      }
    }
  }

  if (!imageShared) {
    const copied = await copyPngToClipboard(file);
    if (copied) {
      imageShared = true;
    } else {
      downloadPngFile(file);
    }
  }

  const waUrl = buildWhatsAppUrl(phone);
  if (waWindow && !waWindow.closed) {
    try {
      waWindow.location.href = waUrl;
    } catch {
      openWhatsAppChat(phone);
    }
  } else if (!imageShared || typeof navigator === "undefined" || !navigator.share) {
    openWhatsAppChat(phone);
  }

  return { ok: true, imageShared };
}
