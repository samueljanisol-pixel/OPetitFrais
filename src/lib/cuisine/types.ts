export type CuisineEntryType = "entree" | "sortie";

export type CuisineJournalEntryRow = {
  id: string;
  journal_date: string;
  entry_type: CuisineEntryType;
  product_id: string;
  quantity: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CuisineFrigoProduct = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  sales_name?: string | null;
  sales_name_ar?: string | null;
  image_path: string | null;
  /** Présent sur le catalogue picker ; absent sur les jointures journal. */
  active?: boolean;
  subcategory_id: string | null;
  ref_subcategory?:
    | { id: string; label: string; label_ar?: string | null; sort_order: number }
    | { id: string; label: string; label_ar?: string | null; sort_order: number }[]
    | null;
  ref_sales_unit?: { label: string } | { label: string }[] | null;
};

export type CuisineJournalEntryWithProduct = CuisineJournalEntryRow & {
  product: CuisineFrigoProduct | null;
};

export type CuisineSubcategoryGroup = {
  subcategoryId: string | null;
  subcategoryLabel: string;
  sortOrder: number;
  products: CuisineFrigoProduct[];
};

export type CuisineDayTotals = {
  entrees: number;
  sorties: number;
  net: number;
};

export type CuisineProductDayTotal = {
  productId: string;
  code: string;
  name: string;
  name_ar: string | null;
  sales_name?: string | null;
  sales_name_ar?: string | null;
  unit: string;
  entrees: number;
  sorties: number;
  /** Quantités vendues du jour (ca_product_day, tous magasins). */
  ventes?: number;
  /** Ventes ventilées par code magasin (ex. M1, M2). */
  ventesByMagasin?: Record<string, number>;
};

export type CuisineSubcategoryTotalsGroup = {
  subcategoryId: string | null;
  subcategoryLabel: string;
  sortOrder: number;
  products: CuisineProductDayTotal[];
};
