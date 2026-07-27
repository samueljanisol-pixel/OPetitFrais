"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { ShopFulfillmentMode } from "@/lib/shop/livraison-types";

type Props = {
  mode: ShopFulfillmentMode | null;
  onChange: (mode: ShopFulfillmentMode) => void;
  pickupMagasinName: string | null;
};

export default function ShopFulfillmentSelector({ mode, onChange, pickupMagasinName }: Props) {
  const t = useTranslations("shop");
  const pickupLabel = pickupMagasinName?.trim()
    ? t("fulfillment.pickupNamed", { name: pickupMagasinName.trim() })
    : t("fulfillment.pickup");

  return (
    <Box
      id="fulfillment"
      sx={{
        mt: 1.5,
        p: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "success.light",
        bgcolor: "rgba(236, 253, 245, 0.7)",
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "success.dark", mb: 1 }}>
        {t("fulfillment.title")}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={mode}
        onChange={(_, v: ShopFulfillmentMode | null) => {
          if (v) onChange(v);
        }}
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          "& .MuiToggleButtonGroup-grouped": {
            border: "1px solid !important",
            borderRadius: "8px !important",
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.8rem",
            lineHeight: 1.25,
            py: 1,
          },
        }}
      >
        <ToggleButton value="pickup" color="success">
          {pickupLabel}
        </ToggleButton>
        <ToggleButton value="home" color="success">
          {t("fulfillment.home")}
        </ToggleButton>
      </ToggleButtonGroup>
      {mode === "pickup" ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("fulfillment.pickupHint")}{" "}
          <Link href="/livraison" className="font-semibold text-emerald-700 underline">
            {t("fulfillment.seeStore")}
          </Link>
        </Typography>
      ) : null}
      {mode === "home" ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("fulfillment.homeHint")}{" "}
          <Link href="/livraison" className="font-semibold text-emerald-700 underline">
            {t("fulfillment.checkZone")}
          </Link>
        </Typography>
      ) : null}
      {mode == null ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("fulfillment.chooseHint")}
        </Typography>
      ) : null}
    </Box>
  );
}
