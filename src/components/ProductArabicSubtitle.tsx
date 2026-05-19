import { Typography } from "@mui/material";
import type { TypographyProps } from "@mui/material/Typography";

type Props = {
  nameAr: string | null | undefined;
  /** Centré (écran parcours titre produit). */
  centered?: boolean;
  /** Même bloc que le nom français en liste récap. */
  matchNameLine?: boolean;
  variant?: "body2" | "caption" | "subtitle2" | "h6";
  className?: string;
};

type ResolvedArabicType = Pick<TypographyProps, "variant" | "color" | "sx">;

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
      variant: "subtitle1",
      color: "text.primary",
      sx: {
        fontWeight: 500,
        fontSize: "1.0625rem",
        lineHeight: 1.4,
      },
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

/** Ligne de nom en arabe sous le nom français ; masquée si vide. */
export default function ProductArabicSubtitle({
  nameAr,
  centered,
  matchNameLine,
  variant = "body2",
  className,
}: Props) {
  const t = typeof nameAr === "string" ? nameAr.trim() : "";
  if (!t) return null;

  const resolved = resolveArabicTypography(centered, matchNameLine, variant);

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
        ...resolved.sx,
      }}
    >
      {t}
    </Typography>
  );
}
