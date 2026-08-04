import type { MetadataRoute } from "next";
import { shopPublicUrl } from "@/lib/shop/hosts";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: shopPublicUrl("/"),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: shopPublicUrl("/livraison"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];
}
