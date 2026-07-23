import { Noto_Sans_Arabic } from "next/font/google";

export const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Stack arabe — ligatures et lettres attachées (export image + UI). */
export const ARABIC_FONT_FAMILY = notoSansArabic.style.fontFamily;

export async function ensureArabicFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) {
    return;
  }
  const family = notoSansArabic.style.fontFamily;
  try {
    await Promise.all([
      document.fonts.load(`400 16px ${family}`),
      document.fonts.load(`600 16px ${family}`),
      document.fonts.load(`700 16px ${family}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Polices déjà chargées ou indisponibles — on capture quand même.
  }
}
