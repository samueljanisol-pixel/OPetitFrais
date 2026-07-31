export type SalesUnitKind = "kg" | "unit";

export type CatalogProduct = {
  id: string;
  code: string;
  salesName: string;
  /** Nom de vente arabe (optionnel). */
  salesNameAr?: string | null;
  price: number;
  salesUnit: SalesUnitKind;
  categoryId: string;
  categoryLabel: string;
  /** Libellé catégorie arabe (optionnel). */
  categoryLabelAr?: string | null;
  subcategoryId: string | null;
  subcategoryLabel: string | null;
  /** Libellé sous-catégorie arabe (optionnel). */
  subcategoryLabelAr?: string | null;
  isBio: boolean;
  photoUrl: string | null;
  active: boolean;
};

export type CartLine = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  categoryLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  salesUnit: SalesUnitKind;
};

export type CartState = {
  lines: CartLine[];
  clientId: string | null;
  clientName: string | null;
};

export type PaymentMode = "cash" | "card" | "credit" | "check" | "transfer";

export type CaisseClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  balanceDue: number;
  isSystem: boolean;
};

export type PaymentLine = {
  id: string;
  mode: PaymentMode;
  amount: number;
};

export type AddProductSource = "grid" | "keyboard" | "scan";

export type AddProductInput = {
  source: AddProductSource;
  code: string;
  product: CatalogProduct;
  weightKg?: number;
  /** Quantité explicite (saisie manuelle grille). */
  qty?: number;
  printPriceMode?: boolean;
};

export type AddProductResult =
  | { ok: true; action: "cart" | "print_label"; line?: CartLine }
  | { ok: false; error: string };
