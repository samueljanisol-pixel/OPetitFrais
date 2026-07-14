"use client";

import Image from "next/image";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, Typography } from "@mui/material";
import { labelFromRefForLocale } from "@/lib/commandes-fournisseur/product-display";
import { productDisplayName } from "@/lib/products/product-display-name";
import { salesUnitCode } from "@/lib/shop/cart-qty";
import { formatShopPriceWithUnit, formatShopQty } from "@/lib/shop/format-price";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { ShopProduct } from "@/lib/shop/types";

type Props = {
  product: ShopProduct;
  photoUrl: string | null;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
};

export default function ShopProductCard({ product, photoUrl, qty, onAdd, onRemove }: Props) {
  const locale = useAppLocale();
  const label = productDisplayName(product, locale);
  const unitCode = salesUnitCode(product.ref_sales_unit);
  const unitLabel = labelFromRefForLocale(product.ref_sales_unit, locale);
  const inCart = qty > 0;
  const qtyLabel = formatShopQty(locale, qty, unitCode);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: inCart ? "success.light" : "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        boxShadow: inCart ? "0 0 0 1px rgba(22,163,74,0.2)" : "none",
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: { xs: 72, sm: 80 },
          flexShrink: 0,
          bgcolor: "grey.50",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0.5,
        }}
      >
        {photoUrl ? (
          <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
            <Image src={photoUrl} alt="" fill className="object-contain" sizes="(max-width: 600px) 100px, 120px" />
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
            —
          </Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 0.625, gap: 0.25 }}>
        <Typography
          variant="caption"
          sx={{
            lineHeight: 1.2,
            fontWeight: 600,
            fontSize: "0.7rem",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: "2.4em",
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          color="success.dark"
          sx={{ fontWeight: 700, fontSize: "0.68rem", lineHeight: 1.2 }}
        >
          {formatShopPriceWithUnit(locale, product.price, unitLabel)}
        </Typography>

        <Box
          sx={{
            mt: "auto",
            pt: 0.375,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 0.25,
          }}
        >
          <IconButton
            size="small"
            color="inherit"
            aria-label="-"
            disabled={qty <= 0}
            onClick={onRemove}
            sx={{
              width: 26,
              height: 26,
              border: "1px solid",
              borderColor: "divider",
              p: 0,
            }}
          >
            <RemoveIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <Typography
            variant="caption"
            sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "0.75rem", minWidth: "1.5rem", textAlign: "center" }}
          >
            {qtyLabel}
          </Typography>
          <IconButton
            size="small"
            color="success"
            aria-label="+"
            onClick={onAdd}
            sx={{
              width: 26,
              height: 26,
              border: "1px solid",
              borderColor: "success.light",
              p: 0,
            }}
          >
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
