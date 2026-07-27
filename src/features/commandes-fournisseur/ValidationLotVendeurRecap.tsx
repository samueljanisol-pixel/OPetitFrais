"use client";

import { useMemo } from "react";
import { TextField, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import VendeurRecapExportBlock from "@/features/commandes-fournisseur/VendeurRecapExportBlock";
import {
  vendorExportLocale,
  vendorRecapCaptureLabels,
} from "@/lib/commandes-fournisseur/vendor-recap-capture-i18n";
import {
  applyLocaleToVendeurRecapRows,
  buildMagasinMxColumnsFromLot,
  buildVendeurRecapGroups,
  SANS_VENDEUR_KEY,
  type RecapLigneInput,
  type VendeurRecapGroup,
  type VendeurRef,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import type { AppLocale } from "@/i18n/config";
import { useAppLocale } from "@/lib/i18n/useAppFormat";

type LotForRecap = {
  commentaire?: string | null;
  commande_fournisseur_lot_inclusion?: {
    commande_fournisseur?: {
      magasin_id?: string;
      magasins?: { code?: string | null } | { code?: string | null }[] | null;
    } | null;
  }[];
};

type Props = {
  lot: LotForRecap;
  supplierLabel: string;
  commandeDateLabel: string;
  commandeDateSlug: string;
  lignes: RecapLigneInput[];
  vendeurs: VendeurRef[];
  vendeurCommentDrafts: Record<string, string>;
  vendeurCommentEditable: boolean;
  onVendeurCommentDraftChange: (vendeurKey: string, value: string) => void;
  onVendeurCommentSave: (vendeurKey: string, commentaire: string) => void | Promise<void>;
  vendeurWhatsAppSent?: Record<string, boolean>;
  onVendeurWhatsAppSent?: (vendeurKey: string) => void | Promise<void>;
};

function vendeurForGroup(vendeurs: VendeurRef[], vendeurKey: string): VendeurRef | undefined {
  if (vendeurKey === SANS_VENDEUR_KEY) {
    return undefined;
  }
  return vendeurs.find((v) => v.id === vendeurKey);
}

/** Locale d’export : `preferred_locale` du vendeur ; sinon locale UI (ex. Station sans marchands). */
function exportLocaleForVendeur(
  vendeur: VendeurRef | undefined,
  uiLocale: AppLocale,
): AppLocale {
  if (!vendeur) {
    return uiLocale;
  }
  return vendorExportLocale(vendeur.preferred_locale);
}

function localizeGroup(
  group: VendeurRecapGroup,
  lignes: RecapLigneInput[],
  vendeur: VendeurRef | undefined,
  uiLocale: AppLocale,
): VendeurRecapGroup {
  const locale = exportLocaleForVendeur(vendeur, uiLocale);
  const labels = vendorRecapCaptureLabels(locale, "", "");
  const rows = group.rows.map((row) => ({ ...row }));
  applyLocaleToVendeurRecapRows(rows, lignes, locale, labels.formatSoitLine);
  return { ...group, rows };
}

export default function ValidationLotVendeurRecap({
  lot,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  lignes,
  vendeurs,
  vendeurCommentDrafts,
  vendeurCommentEditable,
  onVendeurCommentDraftChange,
  onVendeurCommentSave,
  vendeurWhatsAppSent = {},
  onVendeurWhatsAppSent,
}: Props) {
  const t = useTranslations("backoffice.commandes.validation.lotDetail");
  const uiLocale = useAppLocale();
  const magasinColumns = useMemo(() => buildMagasinMxColumnsFromLot(lot), [lot]);
  const groups = useMemo(
    () => buildVendeurRecapGroups(lignes, vendeurs, magasinColumns, supplierLabel, vendeurCommentDrafts),
    [lignes, vendeurs, magasinColumns, supplierLabel, vendeurCommentDrafts],
  );

  const localizedGroups = useMemo(
    () =>
      groups.map((g) =>
        localizeGroup(g, lignes, vendeurForGroup(vendeurs, g.vendeurKey), uiLocale),
      ),
    [groups, lignes, vendeurs, uiLocale],
  );

  if (groups.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" className="!mb-4">
        {t("vendorRecapEmpty")}
      </Typography>
    );
  }

  return (
    <div className="!mb-6">
      <Typography variant="subtitle1" className="!mb-3" sx={{ fontWeight: 600 }}>
        {t("vendorRecapSection")}
      </Typography>
      {groups.map((g, index) => {
        const draft = vendeurCommentDrafts[g.vendeurKey] ?? "";
        const vendeur = vendeurForGroup(vendeurs, g.vendeurKey);
        const exportLocale = exportLocaleForVendeur(vendeur, uiLocale);
        const localized = localizedGroups[index] ?? g;
        const commentField =
          vendeurCommentEditable ? (
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              size="small"
              label={t("vendorCommentLabel", { vendor: g.vendeurLabel })}
              placeholder={t("vendorCommentPlaceholder")}
              value={draft}
              onChange={(e) => onVendeurCommentDraftChange(g.vendeurKey, e.target.value)}
              onBlur={(e) => onVendeurCommentSave(g.vendeurKey, e.target.value)}
            />
          ) : draft.trim() ? (
            <Typography variant="body2" className="whitespace-pre-wrap">
              {draft.trim()}
            </Typography>
          ) : null;

        return (
          <div key={g.vendeurKey} className="!mb-6">
            <VendeurRecapExportBlock
              group={localized}
              magasinColumns={magasinColumns}
              supplierLabel={supplierLabel}
              commandeDateLabel={commandeDateLabel}
              commandeDateSlug={commandeDateSlug}
              exportLocale={exportLocale}
              vendeurPhone={vendeur?.phone}
              footerComment={g.commentaire?.trim() ? g.commentaire : null}
              footerCommentLabel={t("vendorCommentExportLabel")}
              commentField={commentField}
              whatsAppSent={vendeurWhatsAppSent[g.vendeurKey] === true}
              onWhatsAppSent={
                onVendeurWhatsAppSent ? () => onVendeurWhatsAppSent(g.vendeurKey) : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}
