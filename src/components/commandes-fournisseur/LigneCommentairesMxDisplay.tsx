"use client";

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import type { SaisieLigneTarget } from "@/lib/commandes-fournisseur/ligne-saisie-comments";

type Props = {
  targets: SaisieLigneTarget[];
  mxByMagasinId: Map<string, string>;
  align?: "left" | "right" | "center";
};

/** Commentaires ligne en lecture seule, préfixés par code MXX (pas de bouton d’édition). */
export default function LigneCommentairesMxDisplay({
  targets,
  mxByMagasinId,
  align = "right",
}: Props) {
  const tc = useTranslations("backoffice.commandes.common");
  const lines = useMemo(() => {
    const out: { mx: string; text: string }[] = [];
    for (const t of targets) {
      const text = t.lineComment?.trim();
      if (!text) {
        continue;
      }
      out.push({
        mx: mxByMagasinId.get(t.magasinId) ?? "—",
        text,
      });
    }
    out.sort((a, b) => a.mx.localeCompare(b.mx, "fr", { numeric: true }));
    return out;
  }, [targets, mxByMagasinId]);

  if (lines.length === 0) {
    return null;
  }

  const alignItems =
    align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end";
  const textAlign = align;

  return (
    <Box
      sx={{
        mt: 0.5,
        display: "flex",
        flexDirection: "column",
        alignItems,
        gap: 0.25,
        maxWidth: "100%",
      }}
    >
      {lines.map((l) => (
        <Typography
          key={`${l.mx}-${l.text}`}
          variant="caption"
          component="div"
          dir="rtl"
          sx={{
            fontSize: "0.65rem",
            lineHeight: 1.25,
            color: "text.secondary",
            textAlign,
            whiteSpace: "nowrap",
          }}
        >
          <Box component="span" sx={{ fontWeight: 700, unicodeBidi: "plaintext" }}>
            {l.mx}
          </Box>
          {tc("storeCommentSeparator")}
          {l.text}
        </Typography>
      ))}
    </Box>
  );
}
