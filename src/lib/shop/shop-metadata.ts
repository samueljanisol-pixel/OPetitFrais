import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { isShopHost, shopPublicUrl } from "@/lib/shop/hosts";

type ShopSeoKeys = {
  titleKey: "seoTitle" | "seoLivraisonTitle";
  descriptionKey: "seoDescription" | "seoLivraisonDescription";
  path: string;
};

/** Métadonnées indexables pour les pages boutique (host shop uniquement). */
export async function buildShopPageMetadata({
  titleKey,
  descriptionKey,
  path,
}: ShopSeoKeys): Promise<Metadata> {
  const t = await getTranslations("shop");
  const title = t(titleKey);
  const description = t(descriptionKey);
  const url = shopPublicUrl(path);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "O' Petit Frais",
      locale: "fr_MA",
      type: "website",
      images: [{ url: "/logo-opetitfrais.png", alt: "O' Petit Frais" }],
    },
    robots: { index: true, follow: true },
  };
}

/** Métadonnées pour `/` : SEO boutique sur host shop, noindex sur backoffice. */
export async function buildHomePageMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  if (isShopHost(host)) {
    return buildShopPageMetadata({
      titleKey: "seoTitle",
      descriptionKey: "seoDescription",
      path: "/",
    });
  }

  return {
    title: "O' Petit Frais",
    robots: { index: false, follow: false },
  };
}
