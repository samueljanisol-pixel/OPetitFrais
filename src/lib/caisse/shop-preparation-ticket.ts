import {
  concatBytes,
  escPosBlankLine,
  escPosCut,
  escPosInit,
  escPosLine,
  escPosLineCenter,
  escPosSelectCodePage1252,
} from "@opf/caisse-core";
import { salesUnitTicketSuffix } from "@/lib/caisse/shop-boutique-ticket";

export type PreparationTicketLine = {
  qty: number;
  productName: string;
  unitLabel?: string | null;
  unitCode?: string | null;
  comment?: string | null;
};

export type PreparationTicketCategoryGroup = {
  categoryLabel: string;
  lines: PreparationTicketLine[];
};

export type ShopPreparationTicketInput = {
  cartNumber: number;
  clientName: string | null;
  fulfillmentMode: string | null;
  magasinNom?: string | null;
  orderComment?: string | null;
  groups: PreparationTicketCategoryGroup[];
};

function fulfillmentLabel(mode: string | null): string {
  if (mode === "pickup") return "Retrait magasin";
  if (mode === "home") return "Livraison";
  return mode ?? "-";
}

function formatPrepLine(line: PreparationTicketLine): string {
  const name = line.productName.trim() || "Article";
  const comment = line.comment?.trim() ? ` (${line.comment.trim()})` : "";
  const unitKey = (line.unitCode ?? line.unitLabel ?? "").trim().toLowerCase();
  const qtyPart = unitKey === "kg" ? `${line.qty} kg` : `${line.qty}`;
  const suffix = salesUnitTicketSuffix(line.unitCode ?? line.unitLabel);
  return `[ ] ${qtyPart} ${name}${suffix}${comment}`;
}

export function buildShopPreparationTicketEscPos(input: ShopPreparationTicketInput): Uint8Array {
  const chunks: Uint8Array[] = [];
  chunks.push(escPosInit());
  chunks.push(escPosSelectCodePage1252());
  chunks.push(escPosLineCenter("PREPARATION"));
  chunks.push(escPosLineCenter(`Commande #${input.cartNumber}`));
  chunks.push(escPosBlankLine());
  if (input.magasinNom) chunks.push(escPosLine(`Magasin: ${input.magasinNom}`));
  chunks.push(escPosLine(`Client: ${input.clientName ?? "-"}`));
  chunks.push(escPosLine(`Mode: ${fulfillmentLabel(input.fulfillmentMode)}`));
  if (input.orderComment?.trim()) {
    chunks.push(escPosLine(`Note: ${input.orderComment.trim()}`));
  }
  chunks.push(escPosBlankLine());
  chunks.push(escPosLine("Cochez chaque ligne au stylo"));
  chunks.push(escPosBlankLine());

  for (const group of input.groups) {
    chunks.push(escPosLine(`--- ${group.categoryLabel} ---`));
    for (const line of group.lines) {
      chunks.push(escPosLine(formatPrepLine(line)));
    }
    chunks.push(escPosBlankLine());
  }

  chunks.push(escPosCut());
  return concatBytes(chunks);
}
