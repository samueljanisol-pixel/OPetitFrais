"use client";

import { useMemo } from "react";
import { Typography } from "@mui/material";
import VendeurRecapExportBlock from "@/features/commandes-fournisseur/VendeurRecapExportBlock";
import {
  buildCommandeSaisieRecapGroups,
  commandeSaisieDateInfo,
  magasinLabelFromCommande,
  magasinMxColumnFromCommande,
  type CommandeSaisieExportLigne,
} from "@/lib/commandes-fournisseur/commande-saisie-recap-export";
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
  const magasinColumn = useMemo(() => magasinMxColumnFromCommande(commande), [commande]);
  const magasinName = useMemo(() => magasinLabelFromCommande(commande), [commande]);
  const commandeDate = useMemo(() => commandeSaisieDateInfo(commande), [commande]);
  const groups = useMemo(
    () => buildCommandeSaisieRecapGroups(lignes, vendeurs, magasinColumn, supplierLabel),
    [lignes, vendeurs, magasinColumn, supplierLabel],
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="!mb-4">
      <Typography variant="subtitle2" className="!mb-2" sx={{ fontWeight: 600 }}>
        Export image
      </Typography>
      {groups.map((g) => (
        <VendeurRecapExportBlock
          key={g.vendeurKey}
          group={g}
          magasinColumns={[magasinColumn]}
          supplierLabel={supplierLabel}
          commandeDateLabel={commandeDate.label}
          commandeDateSlug={commandeDate.slug}
          footerComment={commande.commentaire}
          footerCommentLabel="Commentaire commande"
          hideTablePreview
          showTotalColumn={false}
          magasinColumnHeader="Quantité"
          headerMagasinName={magasinName}
          commandeParLabel={saisieParLabel}
        />
      ))}
    </div>
  );
}
