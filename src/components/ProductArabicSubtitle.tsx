import { Typography } from "@mui/material";

type Props = {
  nameAr: string | null | undefined;
  /** Centré (écran parcours titre produit). */
  centered?: boolean;
  variant?: "body2" | "caption" | "subtitle2";
  className?: string;
};

/** Ligne de nom en arabe sous le nom français ; masquée si vide. */
export default function ProductArabicSubtitle({
  nameAr,
  centered,
  variant = "body2",
  className,
}: Props) {
  const t = typeof nameAr === "string" ? nameAr.trim() : "";
  if (!t) return null;
  return (
    <Typography
      variant={variant}
      color="text.secondary"
      dir="rtl"
      lang="ar"
      className={className}
      component="p"
      sx={{
        mt: centered ? 0.5 : 0,
        display: "block",
        width: "100%",
        textAlign: centered ? "center" : "right",
      }}
    >
      {t}
    </Typography>
  );
}
