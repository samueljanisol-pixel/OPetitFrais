"use client";

import CloseIcon from "@mui/icons-material/Close";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import {
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { buildOrderText, buildWhatsAppUrl } from "@/lib/shop/format-order-text";
import { getShopWhatsAppPhone, isShopWhatsAppConfigured } from "@/lib/shop/whatsapp-phone";
import { addQtyByStep, subtractQtyByStep } from "@/lib/shop/cart-qty";
import { productDisplayName } from "@/lib/products/product-display-name";
import {
  formatShopKgEstimate,
  formatShopPriceDh,
  formatShopQty,
} from "@/lib/shop/format-price";
import { findShopOption, shopOptionLabel } from "@/lib/shop/shop-order-options";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { AppLocale } from "@/i18n/config";
import type { ShopCartLine, ShopCategoryGroup, ShopProduct } from "@/lib/shop/types";
import { buildCategoryMeta, groupCartLinesByCategory } from "@/lib/shop/group-cart-by-category";
import { cartLineKey } from "@/lib/shop/cart-storage";

type Props = {
  open: boolean;
  onClose: () => void;
  lines: ShopCartLine[];
  productById: Map<string, ShopProduct>;
  categoryGroups: ShopCategoryGroup[];
  onUpdateLine: (productId: string, shopOrderUnitId: string | null, qty: number) => void;
  onClear: () => void;
};

export default function ShopCartPanel({
  open,
  onClose,
  lines,
  productById,
  categoryGroups,
  onUpdateLine,
  onClear,
}: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const [snack, setSnack] = useState<string | null>(null);

  const categoryMeta = useMemo(() => buildCategoryMeta(categoryGroups), [categoryGroups]);

  const groupedLines = useMemo(
    () => groupCartLinesByCategory(lines, productById, categoryMeta, t("uncategorized"), locale),
    [lines, productById, categoryMeta, t, locale],
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0),
    [lines],
  );

  const orderText = useMemo(
    () =>
      buildOrderText(
        lines,
        productById,
        locale,
        {
          title: t("orderTitle"),
          total: t("estimatedTotal"),
          separator: "──────────────────────",
          uncategorized: t("uncategorized"),
        },
        categoryMeta,
      ),
    [lines, productById, locale, t, categoryMeta],
  );

  const whatsAppPhone = getShopWhatsAppPhone();
  const whatsAppHref = isShopWhatsAppConfigured()
    ? buildWhatsAppUrl(whatsAppPhone, orderText)
    : null;

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      setSnack(t("copied"));
    } catch {
      setSnack(t("copyFailed"));
    }
  };

  const formatLineQty = (line: ShopCartLine) => formatShopQty(locale, line.qty, line.unitCode);

  return (
    <>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        slotProps={{ paper: { sx: { maxHeight: "85vh" } } }}
      >
        <Box sx={{ p: 2, pb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
              {t("cart")}
            </Typography>
            <IconButton aria-label={t("close")} onClick={onClose} edge="end">
              <CloseIcon />
            </IconButton>
          </Box>

          {lines.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
              {t("emptyCart")}
            </Typography>
          ) : (
            <>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {groupedLines.map((group) => (
                  <Box key={group.categoryId}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: "success.dark", mb: 0.75, px: 0.5 }}
                    >
                      {group.categoryLabel}
                    </Typography>
                    <List dense disablePadding>
                      {group.lines.map((line) => {
                        const product = productById.get(line.productId);
                        if (!product) return null;
                        const option = findShopOption(product, line.shopOrderUnitId);
                        const step = option?.qtyStep ?? 1;
                        const secondaryParts = [
                          `${formatLineQty(line)} ${line.unitLabel}`,
                          formatShopPriceDh(locale, line.qty * line.priceAtAdd, line.equivKgAtAdd != null),
                        ];
                        if (
                          line.equivKgAtAdd != null &&
                          line.equivKgAtAdd > 0 &&
                          line.shopOrderUnitId != null
                        ) {
                          secondaryParts.push(
                            `soit ${formatShopKgEstimate(locale, line.qty * line.equivKgAtAdd)}`,
                          );
                        }
                        return (
                          <ListItem
                            key={cartLineKey(line)}
                            secondaryAction={
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                <IconButton
                                  size="small"
                                  aria-label="-"
                                  onClick={() =>
                                    onUpdateLine(
                                      line.productId,
                                      line.shopOrderUnitId,
                                      subtractQtyByStep(line.qty, step),
                                    )
                                  }
                                >
                                  −
                                </IconButton>
                                <Typography
                                  variant="body2"
                                  sx={{ minWidth: "2rem", textAlign: "center", fontWeight: 700 }}
                                >
                                  {formatLineQty(line)}
                                </Typography>
                                <IconButton
                                  size="small"
                                  aria-label="+"
                                  onClick={() =>
                                    onUpdateLine(
                                      line.productId,
                                      line.shopOrderUnitId,
                                      addQtyByStep(line.qty, step),
                                    )
                                  }
                                >
                                  +
                                </IconButton>
                              </Box>
                            }
                            sx={{ pr: 12 }}
                          >
                            <ListItemText
                              primary={productDisplayName(product, locale)}
                              secondary={secondaryParts.join(" — ")}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                ))}
              </Box>

              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1.5, fontWeight: 700 }}>
                {t("estimatedTotal")} : {formatShopPriceDh(locale, total, true)}
              </Typography>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {whatsAppHref ? (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<WhatsAppIcon />}
                    component="a"
                    href={whatsAppHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    fullWidth
                  >
                    {t("sendWhatsApp")}
                  </Button>
                ) : null}
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<ContentCopyOutlinedIcon />}
                  onClick={() => void copyList()}
                  fullWidth
                >
                  {t("copyList")}
                </Button>
                <Button variant="text" color="inherit" onClick={onClear} fullWidth>
                  {t("clearCart")}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Drawer>

      <Snackbar
        open={snack != null}
        autoHideDuration={2500}
        onClose={() => setSnack(null)}
        message={snack ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

export function buildCartLineFromProduct(
  product: ShopProduct,
  shopOrderUnitId: string | null,
  qty: number,
  locale: AppLocale,
): ShopCartLine {
  const option = findShopOption(product, shopOrderUnitId);
  const unitLabel = option ? shopOptionLabel(option, locale) : "";
  return {
    productId: product.id,
    shopOrderUnitId,
    qty,
    unitCode: option?.unitCode ?? "unite",
    unitLabel,
    priceAtAdd: option?.unitPrice ?? product.price,
    equivKgAtAdd:
      shopOrderUnitId != null && option?.equivKg != null ? option.equivKg : null,
  };
}
