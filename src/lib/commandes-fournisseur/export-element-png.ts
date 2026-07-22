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

/** Partage image + texte puis ouvre WhatsApp avec le commentaire pré-rempli. */
export async function shareVendorOrderWhatsApp({
  element,
  filename,
  phone,
  text,
  /** Fenêtre WhatsApp déjà ouverte dans le geste clic (évite le bloqueur de popups). */
  waWindow,
}: {
  element: HTMLElement;
  filename: string;
  phone: string;
  text: string;
  waWindow?: Window | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) {
    return { ok: false, error: "Numéro invalide" };
  }

  const trimmedText = text.trim();

  const captured = await captureElementToPngFile(element, filename);
  if (!captured.ok) {
    return captured;
  }

  downloadPngFile(captured.file);

  if (waWindow && !waWindow.closed) {
    try {
      waWindow.location.href = buildWhatsAppUrl(phone, trimmedText);
    } catch {
      openWhatsAppChat(phone, trimmedText);
    }
  } else {
    openWhatsAppChat(phone, trimmedText);
  }

  return { ok: true };
}
