import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import type { PaymentMode } from "@opf/caisse-core";

import billet100 from "../assets/monnaie/billet-100.jpg";
import billet20 from "../assets/monnaie/billet-20.jpg";
import billet200 from "../assets/monnaie/billet-200.jpg";
import billet50 from "../assets/monnaie/billet-50.jpg";
import piece01 from "../assets/monnaie/piece-0-1.jpg";
import piece02 from "../assets/monnaie/piece-0-2.jpg";
import piece05 from "../assets/monnaie/piece-0-5.jpg";
import piece1 from "../assets/monnaie/piece-1.jpg";
import piece10 from "../assets/monnaie/piece-10.jpg";
import piece2 from "../assets/monnaie/piece-2.jpg";
import piece5 from "../assets/monnaie/piece-5.jpg";

export type CashDenomination = {
  amount: number;
  image: string;
  kind: "bill" | "coin";
  /** Pièces 10/5/2/1 DH — même hauteur de cellule que les billets. */
  size?: "main" | "small";
};

export const CASH_DENOMINATIONS: CashDenomination[] = [
  { amount: 200, image: billet200, kind: "bill" },
  { amount: 100, image: billet100, kind: "bill" },
  { amount: 50, image: billet50, kind: "bill" },
  { amount: 20, image: billet20, kind: "bill" },
  { amount: 10, image: piece10, kind: "coin", size: "main" },
  { amount: 5, image: piece5, kind: "coin", size: "main" },
  { amount: 2, image: piece2, kind: "coin", size: "main" },
  { amount: 1, image: piece1, kind: "coin", size: "main" },
  { amount: 0.5, image: piece05, kind: "coin", size: "small" },
  { amount: 0.2, image: piece02, kind: "coin", size: "small" },
  { amount: 0.1, image: piece01, kind: "coin", size: "small" },
];

export type PaymentModeConfig = {
  id: PaymentMode;
  label: string;
  Icon: SvgIconComponent;
};

export const PAYMENT_MODES: PaymentModeConfig[] = [
  { id: "cash", label: "Espèces", Icon: PaymentsOutlinedIcon },
  { id: "card", label: "Carte", Icon: CreditCardOutlinedIcon },
  { id: "credit", label: "Crédit", Icon: AccountBalanceWalletOutlinedIcon },
  { id: "check", label: "Chèque", Icon: ReceiptLongOutlinedIcon },
  { id: "transfer", label: "Virement", Icon: AccountBalanceOutlinedIcon },
];

export function paymentModeLabel(mode: PaymentMode): string {
  return PAYMENT_MODES.find((m) => m.id === mode)?.label ?? mode;
}

export function paymentModeConfig(mode: PaymentMode): PaymentModeConfig | undefined {
  return PAYMENT_MODES.find((m) => m.id === mode);
}

/** Disposition caisse — proportions calées sur la maquette POS. */
export type CashGridCell = {
  amount: number;
  gridColumn: number;
  gridRowStart: number;
  gridRowEnd: number;
};

export const CASH_GRID_COLUMNS = "1.55fr 1.55fr 0.9fr 0.9fr 0.38fr";
export const CASH_GRID_GAP_PX = 6;
/** 8 rangées — 2 blocs principaux × 4, hauteur zone ~218 px. */
export const CASH_GRID_ROW_COUNT = 8;
export const CASH_GRID_ROW_HEIGHT_PX = 22;
export const CASH_GRID_ROW_HEIGHTS_PX = [22, 22, 22, 22, 22, 22, 22, 22] as const;
export const CASH_GRID_ROW_TEMPLATE = CASH_GRID_ROW_HEIGHTS_PX.map((h) => `${h}px`).join(" ");
/** Hauteur d’une cellule principale (4 rangées + 3 interstices). */
export const CASH_MAIN_CELL_HEIGHT_PX =
  CASH_GRID_ROW_HEIGHT_PX * 4 + CASH_GRID_GAP_PX * 3;
export const CASH_GRID_ASPECT_RATIO = "5.8 / 1";

/** Petites pièces — colonne 5, réparties en flex (hauteur = grille principale). */
export const CASH_SMALL_DENOM_AMOUNTS = [0.5, 0.2, 0.1] as const;

export const CASH_GRID_LAYOUT: CashGridCell[] = [
  { amount: 200, gridColumn: 1, gridRowStart: 1, gridRowEnd: 5 },
  { amount: 100, gridColumn: 2, gridRowStart: 1, gridRowEnd: 5 },
  { amount: 50, gridColumn: 1, gridRowStart: 5, gridRowEnd: 9 },
  { amount: 20, gridColumn: 2, gridRowStart: 5, gridRowEnd: 9 },
  { amount: 10, gridColumn: 3, gridRowStart: 1, gridRowEnd: 5 },
  { amount: 5, gridColumn: 4, gridRowStart: 1, gridRowEnd: 5 },
  { amount: 2, gridColumn: 3, gridRowStart: 5, gridRowEnd: 9 },
  { amount: 1, gridColumn: 4, gridRowStart: 5, gridRowEnd: 9 },
];

export function isMainCashDenom(denom: CashDenomination): boolean {
  return denom.kind === "bill" || denom.size === "main";
}

export function cashDenomination(amount: number): CashDenomination | undefined {
  return CASH_DENOMINATIONS.find((d) => d.amount === amount);
}
