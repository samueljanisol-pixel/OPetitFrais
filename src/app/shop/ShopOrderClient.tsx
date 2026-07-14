"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Box, Chip, Fab, Typography } from "@mui/material";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import {
  getCartLineQty,
  readCartFromStorage,
  upsertCartLine,
  writeCartToStorage,
} from "@/lib/shop/cart-storage";
import { addQty, minQtyForUnit, salesUnitCode, subtractQty } from "@/lib/shop/cart-qty";
import type { ShopCartLine, ShopCategoryGroup, ShopProduct } from "@/lib/shop/types";
import ShopShell from "@/app/shop/ShopShell";
import ShopProductCard from "@/app/shop/ShopProductCard";
import ShopCartPanel, { buildCartLineFromProduct } from "@/app/shop/ShopCartPanel";

type Props = {
  initialGroups: ShopCategoryGroup[];
  catalogError: string | null;
};

function flattenProducts(groups: ShopCategoryGroup[]): ShopProduct[] {
  const products: ShopProduct[] = [];
  for (const group of groups) {
    for (const subgroup of group.subgroups) {
      products.push(...subgroup.products);
    }
  }
  return products;
}

export default function ShopOrderClient({ initialGroups, catalogError }: Props) {
  const t = useTranslations("shop");
  const { formatCurrency } = useAppFormat();
  const [groups] = useState(initialGroups);
  const [lines, setLines] = useState<ShopCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    initialGroups[0]?.categoryId ?? null,
  );
  const [hydrated, setHydrated] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const productById = useMemo(() => {
    const map = new Map<string, ShopProduct>();
    for (const p of flattenProducts(groups)) {
      map.set(p.id, p);
    }
    return map;
  }, [groups]);

  useEffect(() => {
    const stored = readCartFromStorage();
    setLines(stored.lines);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCartToStorage({ lines });
  }, [lines, hydrated]);

  const updateLine = useCallback(
    (productId: string, qty: number) => {
      const product = productById.get(productId);
      if (!product) return;
      const unitCode = salesUnitCode(product.ref_sales_unit);
      const line = buildCartLineFromProduct(product, qty);
      setLines((prev) => upsertCartLine(prev, line));
      if (qty <= 0 && lines.length <= 1) {
        setCartOpen(false);
      }
    },
    [productById, lines.length],
  );

  const addProduct = useCallback(
    (product: ShopProduct) => {
      const unitCode = salesUnitCode(product.ref_sales_unit);
      const current = getCartLineQty(lines, product.id);
      const nextQty = current > 0 ? addQty(current, unitCode) : minQtyForUnit(unitCode);
      updateLine(product.id, nextQty);
    },
    [lines, updateLine],
  );

  const removeProduct = useCallback(
    (product: ShopProduct) => {
      const unitCode = salesUnitCode(product.ref_sales_unit);
      const current = getCartLineQty(lines, product.id);
      updateLine(product.id, subtractQty(current, unitCode));
    },
    [lines, updateLine],
  );

  const cartCount = lines.length;
  const cartTotal = lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0);

  const activeGroup = groups.find((g) => g.categoryId === activeCategoryId) ?? groups[0] ?? null;

  if (catalogError) {
    return (
      <ShopShell cartCount={0} onOpenCart={() => setCartOpen(true)}>
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <Typography color="error">{catalogError}</Typography>
        </main>
      </ShopShell>
    );
  }

  return (
    <>
      <ShopShell cartCount={cartCount} onOpenCart={() => setCartOpen(true)}>
        <main className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-emerald-50/80 to-white pb-24">
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Typography variant="h5" color="success.dark" sx={{ fontWeight: 800 }}>
              {t("title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("subtitle")}
            </Typography>
          </Box>

          {groups.length === 0 ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
              <Typography color="text.secondary">{t("noProducts")}</Typography>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  overflowX: "auto",
                  px: 2,
                  py: 1.5,
                  position: "sticky",
                  top: 56,
                  zIndex: 20,
                  bgcolor: "rgba(255,255,255,0.92)",
                  backdropFilter: "blur(8px)",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                {groups.map((group) => (
                  <Chip
                    key={group.categoryId}
                    label={group.categoryLabel}
                    color={group.categoryId === activeGroup?.categoryId ? "success" : "default"}
                    variant={group.categoryId === activeGroup?.categoryId ? "filled" : "outlined"}
                    onClick={() => setActiveCategoryId(group.categoryId)}
                    sx={{ flexShrink: 0 }}
                  />
                ))}
              </Box>

              <Box sx={{ px: 2, py: 2, display: "flex", flexDirection: "column", gap: 3 }}>
                {activeGroup?.subgroups.map((subgroup) => (
                  <Box key={`${activeGroup.categoryId}-${subgroup.subcategoryId ?? "none"}`}>
                    <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
                      {subgroup.subcategoryLabel}
                    </Typography>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "repeat(2, minmax(0, 1fr))",
                          sm: "repeat(3, minmax(0, 1fr))",
                        },
                        gap: 1.5,
                      }}
                    >
                      {subgroup.products.map((product) => {
                        const qty = getCartLineQty(lines, product.id);
                        const photoUrl = productPhotoPublicUrl(supabase, product.image_path);
                        return (
                          <ShopProductCard
                            key={product.id}
                            product={product}
                            photoUrl={photoUrl}
                            qty={qty}
                            onAdd={() => addProduct(product)}
                            onRemove={() => removeProduct(product)}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </main>
      </ShopShell>

      {cartCount > 0 ? (
        <Fab
          color="success"
          variant="extended"
          onClick={() => setCartOpen(true)}
          sx={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            textTransform: "none",
            fontWeight: 700,
            px: 2.5,
          }}
        >
          <ShoppingCartOutlinedIcon sx={{ mr: 1 }} />
          {t("viewCart")} · {formatCurrency(cartTotal)}
        </Fab>
      ) : null}

      <ShopCartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines}
        productById={productById}
        onUpdateLine={updateLine}
        onClear={() => {
          setLines([]);
          setCartOpen(false);
        }}
      />
    </>
  );
}
