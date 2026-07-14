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
import { addQty, salesUnitCode, subtractQty } from "@/lib/shop/cart-qty";
import { productDisplayName } from "@/lib/products/product-display-name";
import { formatShopPriceDh, formatShopQty } from "@/lib/shop/format-price";
import { labelFromRefForLocale } from "@/lib/commandes-fournisseur/product-display";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { ShopCartLine, ShopProduct } from "@/lib/shop/types";

type Props = {
  open: boolean;
  onClose: () => void;
  lines: ShopCartLine[];
  productById: Map<string, ShopProduct>;
  onUpdateLine: (productId: string, qty: number) => void;
  onClear: () => void;
};

export default function ShopCartPanel({
  open,
  onClose,
  lines,
  productById,
  onUpdateLine,
  onClear,
}: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const [snack, setSnack] = useState<string | null>(null);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0),
    [lines],
  );

  const orderText = useMemo(
    () =>
      buildOrderText(lines, productById, locale, {
        title: t("orderTitle"),
        total: t("estimatedTotal"),
        separator: "──────────────────────",
      }),
    [lines, productById, locale, t],
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
              <List dense disablePadding>
                {lines.map((line) => {
                  const product = productById.get(line.productId);
                  if (!product) return null;
                  const unitCode = line.unitCode;
                  const unitLabel = labelFromRefForLocale(product.ref_sales_unit, locale);
                  return (
                    <ListItem
                      key={line.productId}
                      secondaryAction={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <IconButton
                            size="small"
                            aria-label="-"
                            onClick={() =>
                              onUpdateLine(line.productId, subtractQty(line.qty, unitCode))
                            }
                          >
                            −
                          </IconButton>
                          <Typography variant="body2" sx={{ minWidth: "2rem", textAlign: "center", fontWeight: 700 }}>
                            {formatLineQty(line)}
                          </Typography>
                          <IconButton
                            size="small"
                            aria-label="+"
                            onClick={() => onUpdateLine(line.productId, addQty(line.qty, unitCode))}
                          >
                            +
                          </IconButton>
                        </Box>
                      }
                      sx={{ pr: 12 }}
                    >
                      <ListItemText
                        primary={productDisplayName(product, locale)}
                        secondary={`${formatLineQty(line)} ${unitLabel} — ${formatShopPriceDh(locale, line.qty * line.priceAtAdd)}`}
                      />
                    </ListItem>
                  );
                })}
              </List>

              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1.5, fontWeight: 700 }}>
                {t("estimatedTotal")} : {formatShopPriceDh(locale, total)}
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

export function buildCartLineFromProduct(product: ShopProduct, qty: number): ShopCartLine {
  const unitCode = salesUnitCode(product.ref_sales_unit);
  return {
    productId: product.id,
    qty,
    unitCode,
    priceAtAdd: product.price,
  };
}
