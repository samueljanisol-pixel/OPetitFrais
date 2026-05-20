/** Capture un élément DOM en PNG et propose partage mobile ou téléchargement. */
export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: safeName });
          return { ok: true };
        }
      } catch (shareErr) {
        if (shareErr instanceof Error && shareErr.name === "AbortError") {
          return { ok: true };
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur export" };
  }
}
