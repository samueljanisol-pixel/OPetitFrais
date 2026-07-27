"use client";

import { Typography } from "@mui/material";
import type { TypographyProps } from "@mui/material/Typography";
import { useLocale } from "next-intl";

type Props = {
  nameAr: string | null | undefined;
  /** Centré (écran parcours titre produit). */
  centered?: boolean;
  /** Conserve la hauteur du bloc si `name_ar` est vide (parcours : pas de saut de mise en page). */
  reserveSpace?: boolean;
  /** Même bloc que le nom français en liste récap. */
  matchNameLine?: boolean;
  variant?: "body2" | "caption" | "subtitle2" | "h6";
  className?: string;
};

type ResolvedArabicType = Pick<TypographyProps, "variant" | "color" | "sx">;

/** Récap / listes : une seule taille pour tous les noms arabe (sous le nom FR). */
const MATCH_NAME_LINE_SX = {
  fontSize: "1.0625rem",
  lineHeight: 1.4,
  fontWeight: 500,
} as const;

/** Tailles arabe légèrement au-dessus du français à chaque usage. */
function resolveArabicTypography(
  centered: boolean | undefined,
  matchNameLine: boolean | undefined,
  variant: Props["variant"],
): ResolvedArabicType {
  if (centered || variant === "h6") {
    return {
      variant: "subtitle1",
      color: "text.primary",
      sx: {
        fontWeight: 600,
        fontSize: "1.25rem",
        lineHeight: 1.35,
      },
    };
  }
  if (matchNameLine) {
    return {
      variant: "body2",
      color: "text.primary",
      sx: MATCH_NAME_LINE_SX,
    };
  }
  if (variant === "caption") {
    return {
      variant: "body2",
      color: "text.secondary",
      sx: {
        fontSize: "0.9375rem",
        lineHeight: 1.4,
      },
    };
  }
  return {
    variant: "body1",
    color: "text.secondary",
    sx: {
      fontSize: "1rem",
      lineHeight: 1.45,
    },
  };
}

/** Hauteur d’une ligne arabe parcours (subtitle1 centré). */
const PARCOURS_ARABIC_SLOT_MIN_HEIGHT = "1.6875rem";

/** Ligne de nom en arabe sous le nom français ; masquée hors UI arabe. */
export default function ProductArabicSubtitle({
  nameAr,
  centered,
  reserveSpace,
  matchNameLine,
  variant = "body2",
  className,
}: Props) {
  const locale = useLocale();
  /** Affiché uniquement quand l’interface est en arabe. */
  if (!locale.toLowerCase().startsWith("ar")) {
    return null;
  }

  const t = typeof nameAr === "string" ? nameAr.trim() : "";
  const resolved = resolveArabicTypography(centered, matchNameLine, variant);

  if (!t) {
    if (!reserveSpace) return null;
    return (
      <Typography
        variant={resolved.variant}
        color={resolved.color}
        className={className}
        component="p"
        aria-hidden
        sx={{
          mt: centered ? 0.5 : 0,
          display: "block",
          width: "100%",
          minHeight: centered ? PARCOURS_ARABIC_SLOT_MIN_HEIGHT : undefined,
          visibility: "hidden",
          ...resolved.sx,
        }}
      >
        {"\u00a0"}
      </Typography>
    );
  }

  return (
    <Typography
      variant={resolved.variant}
      color={resolved.color}
      dir="rtl"
      lang="ar"
      className={className}
      component="p"
      sx={{
        mt: centered ? 0.5 : 0,
        display: "block",
        width: "100%",
        textAlign: centered ? "center" : "right",
        minHeight: reserveSpace && centered ? PARCOURS_ARABIC_SLOT_MIN_HEIGHT : undefined,
        ...resolved.sx,
      }}
    >
      {t}
    </Typography>
  );
}
