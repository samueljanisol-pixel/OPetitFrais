import {
  concatBytes,
  escPosBlankLine,
  escPosCut,
  escPosInit,
  escPosLine,
  escPosLineCenter,
  escPosSelectCodePage1252,
  escPosStyledLine,
} from "@opf/caisse-core";

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

function normalizeUnit(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Partie unité après la quantité : `kg`, `Unité(s)`, ou `x pièce`. */
export function formatPreparationUnitPart(
  unitCode: string | null | undefined,
  unitLabel: string | null | undefined,
): string {
  const code = normalizeUnit(unitCode);
  const label = (unitLabel ?? "").trim();
  const labelNorm = normalizeUnit(label);

  if (code === "kg" || labelNorm === "kg") return "kg";

  const isDefaultUnit =
    code === "unit" ||
    labelNorm === "unit" ||
    labelNorm === "unite" ||
    labelNorm === "unites" ||
    labelNorm === "unite(s)" ||
    labelNorm === "u" ||
    (!code && !labelNorm);

  if (isDefaultUnit) return "Unité(s)";
  if (label) return `x ${label}`;
  if (unitCode?.trim()) return `x ${unitCode.trim()}`;
  return "Unité(s)";
}

function formatPrepQty(qty: number, unitPart: string): string {
  if (unitPart === "kg") {
    const decimals = Math.abs(qty) >= 10 ? 2 : 3;
    const raw = qty.toFixed(decimals).replace(".", ",");
    return raw.replace(/0+$/, "").replace(/,$/, "") || "0";
  }
  if (Number.isInteger(qty)) return String(qty);
  return String(qty).replace(".", ",");
}

function formatPrepLine(line: PreparationTicketLine): string {
  const name = line.productName.trim() || "Article";
  const comment = line.comment?.trim() ? ` (${line.comment.trim()})` : "";
  const unitPart = formatPreparationUnitPart(line.unitCode, line.unitLabel);
  const qtyPart = formatPrepQty(line.qty, unitPart);
  return `[ ] ${qtyPart} ${unitPart} ${name}${comment}`;
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

  for (const group of input.groups) {
    chunks.push(escPosLine(`--- ${group.categoryLabel} ---`));
    for (const line of group.lines) {
      chunks.push(escPosStyledLine(formatPrepLine(line), { bold: true, doubleHeight: true }));
    }
    chunks.push(escPosBlankLine());
  }

  chunks.push(escPosCut());
  return concatBytes(chunks);
}
