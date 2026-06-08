"use client";

import Image from "next/image";
import { Box, Typography } from "@mui/material";
import AppLink from "@/components/AppLink";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { productDisplayName } from "@/lib/products/product-display-name";
import type { CuisineFrigoProduct } from "@/lib/cuisine/types";

type Props = {
  product: CuisineFrigoProduct;
  photoUrl: string | null;
  href: string;
};

export default function CuisineProductGridCard({ product, photoUrl, href }: Props) {
  const locale = useAppLocale();
  const label = productDisplayName(product, locale);

  return (
    <Box
      component={AppLink}
      href={href}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 0.15s ease",
        "&:hover": { boxShadow: 1 },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "success.main",
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "1",
          flexShrink: 0,
          bgcolor: "grey.50",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0.25,
        }}
      >
        {photoUrl ? (
          <Box
            sx={{
              position: "relative",
              width: "100%",
              height: "100%",
              maxHeight: "100%",
            }}
          >
            <Image
              src={photoUrl}
              alt=""
              fill
              sizes="(max-width: 600px) 20vw, (max-width: 900px) 12vw, 96px"
              style={{ objectFit: "contain", objectPosition: "center" }}
            />
          </Box>
        ) : (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.disabled",
              fontSize: "1.25rem",
            }}
            aria-hidden
          >
            —
          </Box>
        )}
      </Box>
      <Typography
        variant="caption"
        component="p"
        sx={{
          px: 0.25,
          py: 0.25,
          textAlign: "center",
          fontWeight: 600,
          fontSize: "0.5625rem",
          lineHeight: 1.1,
          wordBreak: "break-word",
          hyphens: "auto",
        }}
        dir={locale === "ar-MA" ? "rtl" : undefined}
        lang={locale === "ar-MA" ? "ar" : undefined}
      >
        {label}
      </Typography>
    </Box>
  );
}
