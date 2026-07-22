"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
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
import { normalizeWhatsAppPhone, openWhatsAppChat } from "@/lib/whatsapp/url";
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
  /** Commentaire lot ou commande affiché sous le tableau dans l’image exportée. */
  footerComment?: string | null;
  footerCommentLabel?: string;
  /** Champ commentaire affiché sous le tableau à l’écran (hors capture PNG). */
  commentField?: ReactNode;
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

function ExportActionButtons({
  exporting,
  whatsAppBusy,
  disabled,
  onExport,
  onWhatsApp,
  showWhatsApp,
  exportLabel,
  whatsAppLabel,
}: {
  exporting: boolean;
  whatsAppBusy: boolean;
  disabled: boolean;
  onExport: () => void;
  onWhatsApp: () => void;
  showWhatsApp: boolean;
  exportLabel: string;
  whatsAppLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outlined"
        size="small"
        startIcon={<ImageOutlinedIcon />}
        disabled={disabled || exporting || whatsAppBusy}
        onClick={onExport}
        sx={{ textTransform: "none" }}
      >
        {exporting ? "…" : exportLabel}
      </Button>
      {showWhatsApp ? (
        <Button
          type="button"
          variant="contained"
          size="small"
          color="success"
          startIcon={<WhatsAppIcon />}
          disabled={disabled || exporting || whatsAppBusy}
          onClick={onWhatsApp}
          sx={{ textTransform: "none" }}
        >
          {whatsAppBusy ? "…" : whatsAppLabel}
        </Button>
      ) : null}
    </div>
  );
}

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
  commentField,
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

  const onWhatsApp = useCallback(() => {
    const el = captureRef.current;
    if (!el) {
      return;
    }
    const phone = vendeurPhone?.trim() ?? "";
    if (!normalizeWhatsAppPhone(phone)) {
      setExportErr(tc("whatsAppPhoneMissing"));
      return;
    }
    const text = whatsAppText?.trim() ?? "";
    const waWindow = openWhatsAppChat(phone, text);

    setWhatsAppBusy(true);
    setExportErr(null);
    void shareVendorOrderWhatsApp({
      element: el,
      filename,
      phone,
      text,
      waWindow,
    }).then((result) => {
      if (!result.ok) {
        setExportErr(result.error);
      }
      setWhatsAppBusy(false);
    });
  }, [filename, tc, vendeurPhone, whatsAppText]);

  const footer = footerComment?.trim() ?? "";
  const magasinHeader = headerMagasinName?.trim() ?? "";
  const parLabel = captureLabels.orderByLine?.trim() ?? "";
  const productCount = productCountLabel?.trim() ?? "";
  const showVendeurHeader = vendeurHeaderVisible(group.vendeurLabel, supplierLabel);
  const whatsAppPhoneOk = normalizeWhatsAppPhone(vendeurPhone?.trim() ?? "") !== null;
  const rowsEmpty = group.rows.length === 0;
  const textDir = captureLabels.dir === "rtl" ? "rtl" : undefined;

  const tableLabels = {
    product: captureLabels.product,
    quantity: magasinColumnHeader ?? tc("quantity"),
    total: captureLabels.total,
    udvCond: captureLabels.udvCond,
    noLines: captureLabels.noLines,
  };

  const actionButtons = (
    <ExportActionButtons
      exporting={exporting}
      whatsAppBusy={whatsAppBusy}
      disabled={rowsEmpty}
      onExport={() => void onExport()}
      onWhatsApp={() => void onWhatsApp()}
      showWhatsApp={whatsAppPhoneOk}
      exportLabel={tc("exportImage")}
      whatsAppLabel={tc("sendWhatsApp")}
    />
  );

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

  if (hideTablePreview) {
    return (
      <Box className="!mb-3">
        <div className="!mb-2 flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
        {exportErr ? (
          <Typography color="error" variant="body2" className="!mb-2">
            {exportErr}
          </Typography>
        ) : null}
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
      </Box>
    );
  }

  return (
    <Box className="!mb-8">
      <Box className="max-w-full overflow-x-auto" sx={{ ...captureRootSx, display: "block" }}>
        <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
          <Box sx={{ minWidth: 0, flex: 1, textAlign: captureLabels.dir === "rtl" ? "right" : "left" }}>
            {magasinHeader.length > 0 ? (
              <Typography variant="subtitle1" dir={textDir} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {magasinHeader}
              </Typography>
            ) : null}
            <Typography variant="subtitle1" dir={textDir} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              {captureLabels.supplierOrderLine}
            </Typography>
            {showVendeurHeader ? (
              <Typography variant="subtitle1" dir={textDir} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {group.vendeurLabel}
              </Typography>
            ) : null}
          </Box>
          {actionButtons}
        </div>
        <Typography
          variant="caption"
          color="text.secondary"
          dir={textDir}
          sx={{ display: "block", mb: parLabel.length > 0 ? 0.25 : 1, whiteSpace: "nowrap" }}
        >
          {captureLabels.orderOnLine}
        </Typography>
        {parLabel.length > 0 ? (
          <Typography
            variant="caption"
            color="text.secondary"
            dir={textDir}
            sx={{ display: "block", mb: productCount.length > 0 ? 0.25 : 1, whiteSpace: "nowrap" }}
          >
            {parLabel}
          </Typography>
        ) : null}
        {productCount.length > 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            dir={textDir}
            sx={{ display: "block", mb: 1, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {productCount}
          </Typography>
        ) : null}
        <VendeurRecapTable
          group={group}
          magasinColumns={magasinColumns}
          showTotalColumn={showTotalColumn}
          magasinColumnHeader={magasinColumnHeader}
          labels={tableLabels}
        />
        {commentField ? <Box className="!mt-3">{commentField}</Box> : null}
      </Box>
      {exportErr ? (
        <Typography color="error" variant="body2" className="!mt-2">
          {exportErr}
        </Typography>
      ) : null}
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
    </Box>
  );
}
