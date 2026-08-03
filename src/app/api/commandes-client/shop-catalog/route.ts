import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireCommandesClientReadAccess } from "@/lib/commandes-client/api-auth";
import { normalizeLocale } from "@/i18n/config";
import { loadShopCatalog, loadShopProductsByIds } from "@/lib/shop/load-shop-catalog";
import type { ShopProduct } from "@/lib/shop/types";

export async function GET(req: NextRequest) {
  const gate = await requireCommandesClientReadAccess();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const locale = normalizeLocale(await getLocale());
  const uncategorizedLabel = locale === "ar-MA" ? "بدون فئة" : "Sans catégorie";
  const { groups, error } = await loadShopCatalog(locale, uncategorizedLabel);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const products: ShopProduct[] = [];
  const categories: Array<{ id: string; label: string; sortOrder: number }> = [];
  const categoryIds = new Set<string>();
  for (const group of groups) {
    categories.push({
      id: group.categoryId,
      label: group.categoryLabel,
      sortOrder: group.sortOrder,
    });
    categoryIds.add(group.categoryId);
    for (const subgroup of group.subgroups) {
      products.push(...subgroup.products);
    }
  }

  const includeIds = req.nextUrl.searchParams
    .get("includeIds")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [];
  const missingIds = includeIds.filter((id) => !products.some((p) => p.id === id));
  if (missingIds.length > 0) {
    const extra = await loadShopProductsByIds(missingIds, locale);
    if (extra.error) {
      return NextResponse.json({ error: extra.error }, { status: 500 });
    }
    products.push(...extra.products);
    for (const cat of extra.categories) {
      if (!categoryIds.has(cat.id)) {
        categories.push(cat);
        categoryIds.add(cat.id);
      }
    }
  }

  return NextResponse.json({ products, categories });
}
