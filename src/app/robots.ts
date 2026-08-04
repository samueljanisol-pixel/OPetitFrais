import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import {
  BACKOFFICE_PATH_PREFIXES,
  isShopHost,
  shopPublicUrl,
} from "@/lib/shop/hosts";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");

  if (!isShopHost(host)) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...BACKOFFICE_PATH_PREFIXES],
    },
    sitemap: shopPublicUrl("/sitemap.xml"),
  };
}
