"use client";

import { useMemo } from "react";
import { Typography } from "@mui/material";
import VendeurRecapExportBlock from "@/features/commandes-fournisseur/VendeurRecapExportBlock";
import {
  buildMagasinMxColumnsFromLot,
  buildVendeurRecapGroups,
  type RecapLigneInput,
  type VendeurRef,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

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
};

export default function ValidationLotVendeurRecap({
  lot,
  supplierLabel,
  commandeDateLabel,
  commandeDateSlug,
  lignes,
  vendeurs,
}: Props) {
  const magasinColumns = useMemo(() => buildMagasinMxColumnsFromLot(lot), [lot]);
  const lotCommentaire = typeof lot.commentaire === "string" ? lot.commentaire : null;
  const groups = useMemo(
    () => buildVendeurRecapGroups(lignes, vendeurs, magasinColumns, supplierLabel),
    [lignes, vendeurs, magasinColumns, supplierLabel],
  );

  if (groups.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" className="!mb-4">
        Aucune ligne pour le récap vendeurs.
      </Typography>
    );
  }

  return (
    <div className="!mb-6">
      <Typography variant="subtitle1" className="!mb-3" sx={{ fontWeight: 600 }}>
        Récapitulatif par vendeur
      </Typography>
      {groups.map((g) => (
        <VendeurRecapExportBlock
          key={g.vendeurKey}
          group={g}
          magasinColumns={magasinColumns}
          supplierLabel={supplierLabel}
          commandeDateLabel={commandeDateLabel}
          commandeDateSlug={commandeDateSlug}
          footerComment={lotCommentaire}
          footerCommentLabel="Commentaire lot"
        />
      ))}
    </div>
  );
}
