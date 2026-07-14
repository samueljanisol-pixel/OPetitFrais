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
  href?: string;
  columnsPerRow: number;
  formattedPrice?: string;
  compact?: boolean;
};

const cardSx = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  borderRadius: 2,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "background.paper",
  overflow: "hidden",
  color: "inherit",
} as const;

export default function CuisineProductGridCard({
  product,
  photoUrl,
  href,
  columnsPerRow,
  formattedPrice,
  compact = false,
}: Props) {
  const locale = useAppLocale();
  const label = productDisplayName(product, locale);
  const imageSizeVw = Math.max(12, Math.ceil(100 / columnsPerRow));
  const isLink = href != null && href.length > 0;
  const priceCircleSize = formattedPrice
    ? compact
      ? formattedPrice.length <= 3
        ? 36
        : formattedPrice.length <= 5
          ? 42
          : 48
      : formattedPrice.length <= 3
        ? 44
        : formattedPrice.length <= 5
          ? 50
          : 56
    : 0;

  const content = (
    <>
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
          p: compact ? 0.375 : 0.75,
        }}
      >
        {photoUrl ? (
          compact ? (
            <Box
              component="img"
              src={photoUrl}
              alt=""
              className="product-photo"
              loading="eager"
              decoding="sync"
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center",
              }}
            />
          ) : (
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
                sizes={`${imageSizeVw}vw`}
                style={{ objectFit: "contain", objectPosition: "center" }}
              />
            </Box>
          )
        ) : (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.disabled",
              fontSize: compact ? "1rem" : "1.75rem",
            }}
            aria-hidden
          >
            —
          </Box>
        )}
      </Box>
      {formattedPrice ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Typography
            variant="caption"
            component="p"
            sx={{
              px: compact ? 0.25 : 0.5,
              pt: compact ? 0.375 : 0.625,
              pb: 0,
              textAlign: "center",
              fontWeight: 600,
              fontSize: compact
                ? { xs: "0.5625rem", sm: "0.625rem" }
                : { xs: "0.6875rem", sm: "0.75rem" },
              lineHeight: 1.15,
              wordBreak: "break-word",
              hyphens: "auto",
              flex: "1 1 auto",
              minHeight: compact ? "2.4em" : "2.8em",
            }}
            dir={locale === "ar-MA" ? "rtl" : undefined}
            lang={locale === "ar-MA" ? "ar" : undefined}
          >
            {label}
          </Typography>
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              flexShrink: 0,
              mt: "auto",
              px: compact ? 0.25 : 0.5,
              pt: compact ? 0.25 : 0.375,
              pb: compact ? 0.375 : 0.625,
            }}
          >
            <Box
              component="span"
              className="price-badge"
              sx={{
                display: "grid",
                placeItems: "center",
                width: priceCircleSize,
                height: priceCircleSize,
                flexShrink: 0,
                borderRadius: "50%",
                bgcolor: "success.main",
                color: "success.contrastText",
                fontWeight: 700,
                fontSize: compact
                  ? { xs: "0.875rem", sm: "0.9375rem" }
                  : { xs: "1.25rem", sm: "1.375rem" },
                letterSpacing: "-0.02em",
                lineHeight: 1,
                textAlign: "center",
                boxSizing: "border-box",
                p: 0,
                m: 0,
                fontVariantNumeric: "tabular-nums",
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
              }}
              dir={locale === "ar-MA" ? "rtl" : undefined}
              lang={locale === "ar-MA" ? "ar" : undefined}
            >
              {formattedPrice}
            </Box>
          </Box>
        </Box>
      ) : (
        <Typography
          variant="caption"
          component="p"
          sx={{
            px: compact ? 0.25 : 0.5,
            pt: compact ? 0.375 : 0.625,
            pb: compact ? 0.375 : 0.625,
            textAlign: "center",
            fontWeight: 600,
            fontSize: compact
              ? { xs: "0.5625rem", sm: "0.625rem" }
              : { xs: "0.6875rem", sm: "0.75rem" },
            lineHeight: 1.15,
            wordBreak: "break-word",
            hyphens: "auto",
          }}
          dir={locale === "ar-MA" ? "rtl" : undefined}
          lang={locale === "ar-MA" ? "ar" : undefined}
        >
          {label}
        </Typography>
      )}
    </>
  );

  if (isLink) {
    return (
      <Box
        component={AppLink}
        href={href}
        sx={{
          ...cardSx,
          textDecoration: "none",
          transition: "box-shadow 0.15s ease",
          "&:hover": { boxShadow: 2 },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "success.main",
            outlineOffset: 2,
          },
        }}
      >
        {content}
      </Box>
    );
  }

  return <Box sx={cardSx}>{content}</Box>;
}
