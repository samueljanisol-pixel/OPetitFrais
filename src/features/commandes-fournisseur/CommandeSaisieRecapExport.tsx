"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { useTranslations } from "next-intl";
import {
  arabicTextClassName,
  arabicTextSx,
  captureRootSx,
  VendeurRecapCaptureHeader,
  VendeurRecapTable,
} from "@/features/commandes-fournisseur/vendeur-recap-export-parts";
import { exportElementAsPng } from "@/lib/commandes-fournisseur/export-element-png";
import {
  buildCommandeSaisieRecapGroups,
  commandeSaisieDateInfo,
  magasinLabelFromCommande,
  magasinMxColumnFromCommande,
  type CommandeSaisieExportLigne,
} from "@/lib/commandes-fournisseur/commande-saisie-recap-export";
import { vendorRecapCaptureLabels } from "@/lib/commandes-fournisseur/vendor-recap-capture-i18n";
import { useAppLocale } from "@/lib/i18n/useAppFormat";

type Props = {
  commande: {
    magasin_id: string;
    validated_at?: string | null;
    created_at?: string;
    commentaire?: string | null;
    magasins?: { code?: string | null; nom?: string | null } | { code?: string | null; nom?: string | null }[] | null;
  };
  supplierLabel: string;
  lignes: CommandeSaisieExportLigne[];
  saisieParLabel?: string | null;
};

export default function CommandeSaisieRecapExport({
  commande,
  supplierLabel,
  lignes,
  saisieParLabel,
}: Props) {
  const locale = useAppLocale();
  const tc = useTranslations("backoffice.commandes.common");
  const tRecap = useTranslations("backoffice.commandes.saisie.recap");
  const tStatus = useTranslations("backoffice.status");
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const productCountLabel = useMemo(
    () => (lignes.length > 0 ? tStatus("productCount", { count: lignes.length }) : null),
    [lignes.length, tStatus],
  );
  const magasinColumn = useMemo(() => magasinMxColumnFromCommande(commande), [commande]);
  const magasinName = useMemo(() => magasinLabelFromCommande(commande), [commande]);
  const commandeDate = useMemo(() => commandeSaisieDateInfo(commande), [commande]);
  const captureLabels = useMemo(
    () => vendorRecapCaptureLabels(locale, supplierLabel, commandeDate.label, saisieParLabel),
    [locale, supplierLabel, commandeDate.label, saisieParLabel],
  );
  const group = useMemo(() => {
    const groups = buildCommandeSaisieRecapGroups(
      lignes,
      magasinColumn,
      supplierLabel,
      locale,
      captureLabels.formatSoitLine,
    );
    return groups[0] ?? null;
  }, [lignes, magasinColumn, supplierLabel, locale, captureLabels.formatSoitLine]);

  const onExport = useCallback(async () => {
    const el = captureRef.current;
    if (!el) {
      return;
    }
    setExporting(true);
    setExportErr(null);
    const filename = `commande-${commandeDate.slug}-${supplierLabel}.png`;
    const result = await exportElementAsPng(el, filename);
    if (!result.ok) {
      setExportErr(result.error);
    }
    setExporting(false);
  }, [commandeDate.slug, supplierLabel]);

  if (!group || group.rows.length === 0) {
    return null;
  }

  const magasinHeader = magasinName.trim();
  const productCount = productCountLabel?.trim() ?? "";
  const footer = commande.commentaire?.trim() ?? "";
  const isRtl = captureLabels.dir === "rtl";
  const orderCommentLabel = tRecap("orderCommentLabel");

  const tableLabels = {
    product: captureLabels.product,
    quantity: tc("quantity"),
    total: captureLabels.total,
    udvCond: captureLabels.udvCond,
    noLines: captureLabels.noLines,
  };

  const captureContent = (
    <Box ref={captureRef} sx={{ ...captureRootSx, direction: captureLabels.dir }}>
      <VendeurRecapCaptureHeader
        magasinHeader={magasinHeader}
        vendeurLabel={group.vendeurLabel}
        showVendeurHeader={false}
        orderOnLine={captureLabels.orderOnLine}
        orderByLine={captureLabels.orderByLine}
        productCount={productCount}
        dir={captureLabels.dir}
      />
      <VendeurRecapTable
        group={group}
        magasinColumns={[magasinColumn]}
        showTotalColumn={false}
        magasinColumnHeader={tc("quantity")}
        labels={tableLabels}
        captureDir={captureLabels.dir}
      />
      {footer ? (
        <Typography
          variant="caption"
          component="p"
          className={isRtl ? `!mt-2 ${arabicTextClassName}` : "!mt-2"}
          dir={isRtl ? "rtl" : undefined}
          lang={isRtl ? "ar" : undefined}
          sx={{
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            maxWidth: "none",
            ...(isRtl ? arabicTextSx : {}),
          }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {orderCommentLabel}
          </Box>
          {" : "}
          {footer}
        </Typography>
      ) : null}
    </Box>
  );

  return (
    <div className="!mb-4">
      <Typography variant="subtitle2" className="!mb-2" sx={{ fontWeight: 600 }}>
        {tc("exportImageSection")}
      </Typography>
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
    </div>
  );
}
