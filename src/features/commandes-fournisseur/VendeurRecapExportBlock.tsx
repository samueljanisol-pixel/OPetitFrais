"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { useTranslations } from "next-intl";
import {
  exportElementAsPng,
  shareVendorOrderWhatsApp,
} from "@/lib/commandes-fournisseur/export-element-png";
import {
  captureRootSx,
  vendeurHeaderVisible,
  VendeurRecapCaptureHeader,
  VendeurRecapTable,
} from "@/features/commandes-fournisseur/vendeur-recap-export-parts";
import type { AppLocale } from "@/i18n/config";
import {
  vendorRecapCaptureLabels,
  type VendorRecapCaptureLabels,
} from "@/lib/commandes-fournisseur/vendor-recap-capture-i18n";
import type { MagasinMxColumn, VendeurRecapGroup } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

type Props = {
  group: VendeurRecapGroup;
  magasinColumns: MagasinMxColumn[];
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  exportLocale?: AppLocale;
  vendeurPhone?: string | null;
  whatsAppText?: string | null;
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
  exportLocale = "fr",
  vendeurPhone,
  whatsAppText,
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
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const captureLabels: VendorRecapCaptureLabels = useMemo(
    () => vendorRecapCaptureLabels(exportLocale, supplierLabel, commandeDateLabel, commandeParLabel),
    [exportLocale, supplierLabel, commandeDateLabel, commandeParLabel],
  );

  const filename = useMemo(
    () => `commande-${commandeDateSlug}-${supplierLabel}-${group.vendeurLabel}.png`,
    [commandeDateSlug, group.vendeurLabel, supplierLabel],
  );

  const onExport = useCallback(async () => {
    const el = captureRef.current;
    if (!el) {
      return;
    }
    setExporting(true);
    setExportErr(null);
    const result = await exportElementAsPng(el, filename);
    if (!result.ok) {
      setExportErr(result.error);
    }
    setExporting(false);
  }, [filename]);

  const onWhatsApp = useCallback(async () => {
    const el = captureRef.current;
    if (!el) {
      return;
    }
    const phone = vendeurPhone?.trim() ?? "";
    if (phone.length === 0) {
      setExportErr(tc("whatsAppPhoneMissing"));
      return;
    }
    setWhatsAppBusy(true);
    setExportErr(null);
    const result = await shareVendorOrderWhatsApp({
      element: el,
      filename,
      phone,
      text: whatsAppText?.trim() ?? "",
    });
    if (!result.ok) {
      setExportErr(result.error);
    }
    setWhatsAppBusy(false);
  }, [filename, tc, vendeurPhone, whatsAppText]);

  const footer = footerComment?.trim() ?? "";
  const magasinHeader = headerMagasinName?.trim() ?? "";
  const productCount = productCountLabel?.trim() ?? "";
  const showVendeurHeader = vendeurHeaderVisible(group.vendeurLabel, supplierLabel);
  const phoneTrim = vendeurPhone?.trim() ?? "";

  const tableLabels = {
    product: captureLabels.product,
    quantity: magasinColumnHeader ?? tc("quantity"),
    total: captureLabels.total,
    udvCond: captureLabels.udvCond,
    noLines: captureLabels.noLines,
  };

  const captureContent = (
    <Box ref={captureRef} sx={{ ...captureRootSx, direction: captureLabels.dir }}>
      <VendeurRecapCaptureHeader
        magasinHeader={magasinHeader}
        supplierOrderLine={captureLabels.supplierOrderLine}
        vendeurLabel={group.vendeurLabel}
        showVendeurHeader={showVendeurHeader}
        orderOnLine={captureLabels.orderOnLine}
        orderByLine={captureLabels.orderByLine}
        productCount={productCount}
        dir={captureLabels.dir}
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
          disabled={exporting || whatsAppBusy || group.rows.length === 0}
          onClick={() => void onExport()}
          sx={{ textTransform: "none" }}
        >
          {exporting ? "…" : tc("exportImage")}
        </Button>
        {phoneTrim.length > 0 ? (
          <Button
            type="button"
            variant="contained"
            size="small"
            color="success"
            startIcon={<WhatsAppIcon />}
            disabled={exporting || whatsAppBusy || group.rows.length === 0}
            onClick={() => void onWhatsApp()}
            sx={{ textTransform: "none" }}
          >
            {whatsAppBusy ? "…" : tc("sendWhatsApp")}
          </Button>
        ) : null}
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
