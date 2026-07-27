"use client";

import Image from "next/image";
import { useMemo } from "react";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, Chip, IconButton, Typography } from "@mui/material";
import {
  findShopOption,
  resolveShopOrderOptions,
  shopOptionLabel,
} from "@/lib/shop/shop-order-options";
import {
  formatShopPieceWeightHint,
  formatShopPriceWithUnit,
  formatShopQty,
} from "@/lib/shop/format-price";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { productDisplayName } from "@/lib/products/product-display-name";
import { labelFromRefForLocale } from "@/lib/commandes-fournisseur/product-display";
import type { ShopProduct } from "@/lib/shop/types";

type Props = {
  product: ShopProduct;
  photoUrl: string | null;
  qty: number;
  selectedShopOrderUnitId: string | null;
  onSelectUnit: (shopOrderUnitId: string | null) => void;
  onAdd: () => void;
  onRemove: () => void;
};

export default function ShopProductCard({
  product,
  photoUrl,
  qty,
  selectedShopOrderUnitId,
  onSelectUnit,
  onAdd,
  onRemove,
}: Props) {
  const locale = useAppLocale();
  const label = productDisplayName(product, locale);
  const options = useMemo(() => resolveShopOrderOptions(product), [product]);
  const option = findShopOption(product, selectedShopOrderUnitId) ?? options[0] ?? null;
  const inCart = qty > 0;
  const qtyLabel = option ? formatShopQty(locale, qty, option.unitCode) : "0";
  const priceUnitLabel = labelFromRefForLocale(product.ref_sales_unit, locale);
  const pieceWeight =
    product.piece_weight_kg != null && Number(product.piece_weight_kg) > 0
      ? Number(product.piece_weight_kg)
      : null;

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
          {formatShopPriceWithUnit(locale, product.price, priceUnitLabel)}
        </Typography>
        {pieceWeight != null && options.some((o) => o.shopOrderUnitId != null) ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", lineHeight: 1.2 }}>
            {formatShopPieceWeightHint(locale, pieceWeight)}
          </Typography>
        ) : null}

        {options.length > 1 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25, mt: 0.25 }}>
            {options.map((o) => {
              const selected = o.shopOrderUnitId === selectedShopOrderUnitId;
              return (
                <Chip
                  key={o.shopOrderUnitId ?? "__udv__"}
                  label={shopOptionLabel(o, locale)}
                  size="small"
                  color={selected ? "success" : "default"}
                  variant={selected ? "filled" : "outlined"}
                  onClick={() => onSelectUnit(o.shopOrderUnitId)}
                  sx={{ height: 18, fontSize: "0.58rem", "& .MuiChip-label": { px: 0.5 } }}
                />
              );
            })}
          </Box>
        ) : null}

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
            disabled={qty <= 0 || !option}
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
            sx={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              fontSize: "0.75rem",
              minWidth: "1.5rem",
              textAlign: "center",
            }}
          >
            {qtyLabel}
          </Typography>
          <IconButton
            size="small"
            color="success"
            aria-label="+"
            disabled={!option}
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
