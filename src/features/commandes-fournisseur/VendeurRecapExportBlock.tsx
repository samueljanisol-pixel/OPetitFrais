"use client";

import { useCallback, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { useTranslations } from "next-intl";
import { exportElementAsPng } from "@/lib/commandes-fournisseur/export-element-png";
import {
  captureRootSx,
  vendeurHeaderVisible,
  VendeurRecapCaptureHeader,
  VendeurRecapTable,
} from "@/features/commandes-fournisseur/vendeur-recap-export-parts";
import type { MagasinMxColumn, VendeurRecapGroup } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

type Props = {
  group: VendeurRecapGroup;
  magasinColumns: MagasinMxColumn[];
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  /** Commentaire lot ou commande affiché sous le tableau. */
  footerComment?: string | null;
  footerCommentLabel?: string;
  /** Masque l’aperçu tableau à l’écran (export seul). */
  hideTablePreview?: boolean;
  /** Colonne Total (plusieurs magasins lot validation). */
  showTotalColumn?: boolean;
  /** En-tête des colonnes magasin (ex. « Quantité » au lieu de MXX). */
  magasinColumnHeader?: string;
  /** En-tête image : nom du magasin (commande saisie). */
  headerMagasinName?: string | null;
  /** Sous la date : « par {utilisateur} ». */
  commandeParLabel?: string | null;
  /** Ex. « 12 produits » — affiché au-dessus du tableau dans l’image. */
  productCountLabel?: string | null;
};

export default function VendeurRecapExportBlock({
  group,
  magasinColumns,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  footerComment,
  footerCommentLabel = "Commentaire lot",
  hideTablePreview = false,
  showTotalColumn = true,
  magasinColumnHeader,
  headerMagasinName,
  commandeParLabel,
  productCountLabel,
}: Props) {
  const tc = useTranslations("backoffice.commandes.common");
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    const el = captureRef.current;
    if (!el) {
      return;
    }
    setExporting(true);
    setExportErr(null);
    const filename = `commande-${commandeDateSlug}-${supplierLabel}-${group.vendeurLabel}.png`;
    const result = await exportElementAsPng(el, filename);
    if (!result.ok) {
      setExportErr(result.error);
    }
    setExporting(false);
  }, [commandeDateSlug, group.vendeurLabel, supplierLabel]);

  const footer = footerComment?.trim() ?? "";
  const magasinHeader = headerMagasinName?.trim() ?? "";
  const parLabel = commandeParLabel?.trim() ?? "";
  const productCount = productCountLabel?.trim() ?? "";
  const showVendeurHeader = vendeurHeaderVisible(group.vendeurLabel, supplierLabel);

  const tableLabels = {
    product: "Produit",
    quantity: magasinColumnHeader ?? "Quantité",
    total: tc("total"),
    udvCond: tc("udvCond"),
    noLines: tc("noLines"),
  };

  const captureContent = (
    <Box ref={captureRef} sx={captureRootSx}>
      <VendeurRecapCaptureHeader
        magasinHeader={magasinHeader}
        supplierOrderLine={`Commande Fournisseur : ${supplierLabel}`}
        vendeurLabel={group.vendeurLabel}
        showVendeurHeader={showVendeurHeader}
        orderOnLine={`Commande du ${commandeDateLabel}`}
        orderByLine={parLabel.length > 0 ? `par ${parLabel}` : null}
        productCount={productCount}
      />
      <VendeurRecapTable
        group={group}
        magasinColumns={magasinColumns}
        showTotalColumn={showTotalColumn}
        magasinColumnHeader={magasinColumnHeader}
        labels={tableLabels}
      />
      {footer ? (
        <Typography
          variant="caption"
          component="p"
          className="!mt-2"
          sx={{ lineHeight: 1.4, whiteSpace: "nowrap", maxWidth: "none" }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {footerCommentLabel}
          </Box>
          {" : "}
          {footer}
        </Typography>
      ) : null}
    </Box>
  );

  return (
    <Box className={hideTablePreview ? "!mb-3" : "!mb-8"}>
      <div className="!mb-2 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outlined"
          size="small"
          startIcon={<ImageOutlinedIcon />}
          disabled={exporting || group.rows.length === 0}
          onClick={() => void onExport()}
          sx={{ textTransform: "none" }}
        >
          {exporting ? "…" : tc("exportImage")}
        </Button>
      </div>
      {exportErr ? (
        <Typography color="error" variant="body2" className="!mb-2">
          {exportErr}
        </Typography>
      ) : null}

      {hideTablePreview ? (
        <Box
          aria-hidden
          sx={{
            position: "fixed",
            left: -10000,
            top: 0,
            pointerEvents: "none",
            opacity: 0,
            overflow: "hidden",
          }}
        >
          {captureContent}
        </Box>
      ) : (
        <Box className="max-w-full overflow-x-auto" sx={{ display: "inline-block" }}>
          {captureContent}
        </Box>
      )}
    </Box>
  );
}
