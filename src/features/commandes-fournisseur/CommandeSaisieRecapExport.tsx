"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { useTranslations } from "next-intl";
import {
  captureRootSx,
  vendeurHeaderVisible,
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
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import type { VendeurRef } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

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
  vendeurs: VendeurRef[];
  saisieParLabel?: string | null;
};

export default function CommandeSaisieRecapExport({
  commande,
  supplierLabel,
  lignes,
  vendeurs,
  saisieParLabel,
}: Props) {
  const locale = useAppLocale();
  const tc = useTranslations("backoffice.commandes.common");
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
  const formatSoitLine = useCallback(
    (qty: string, unit: string) => tc("soitLine", { qty, unit }),
    [tc],
  );
  const groups = useMemo(
    () =>
      buildCommandeSaisieRecapGroups(
        lignes,
        vendeurs,
        magasinColumn,
        supplierLabel,
        locale,
        formatSoitLine,
      ),
    [lignes, vendeurs, magasinColumn, supplierLabel, locale, formatSoitLine],
  );

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

  if (groups.length === 0) {
    return null;
  }

  const magasinHeader = magasinName.trim();
  const parLabel = saisieParLabel?.trim() ?? "";
  const productCount = productCountLabel?.trim() ?? "";
  const footer = commande.commentaire?.trim() ?? "";
  const hasMultipleGroups = groups.length > 1;

  const tableLabels = {
    product: "Produit",
    quantity: tc("quantity"),
    total: tc("total"),
    udvCond: tc("udvCond"),
    noLines: tc("noLines"),
  };

  const captureContent = (
    <Box ref={captureRef} sx={captureRootSx}>
      <VendeurRecapCaptureHeader
        magasinHeader={magasinHeader}
        supplierOrderLine={`Commande Fournisseur : ${supplierLabel}`}
        vendeurLabel={groups[0]!.vendeurLabel}
        showVendeurHeader={!hasMultipleGroups && vendeurHeaderVisible(groups[0]!.vendeurLabel, supplierLabel)}
        orderOnLine={`Commande du ${commandeDate.label}`}
        orderByLine={parLabel.length > 0 ? `par ${parLabel}` : null}
        productCount={productCount}
      />
      {groups.map((g, index) => {
        const showVendeurSubheader =
          hasMultipleGroups && vendeurHeaderVisible(g.vendeurLabel, supplierLabel);
        return (
          <Fragment key={g.vendeurKey}>
            {showVendeurSubheader ? (
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 0.75,
                  mt: index > 0 ? 1.5 : 0,
                  whiteSpace: "nowrap",
                }}
              >
                {g.vendeurLabel}
              </Typography>
            ) : null}
            <VendeurRecapTable
              group={g}
              magasinColumns={[magasinColumn]}
              showTotalColumn={false}
              magasinColumnHeader={tc("quantity")}
              labels={tableLabels}
            />
          </Fragment>
        );
      })}
      {footer ? (
        <Typography
          variant="caption"
          component="p"
          className="!mt-2"
          sx={{ lineHeight: 1.4, whiteSpace: "nowrap", maxWidth: "none" }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            Commentaire commande
          </Box>
          {" : "}
          {footer}
        </Typography>
      ) : null}
    </Box>
  );

  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

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
          disabled={exporting || totalRows === 0}
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
