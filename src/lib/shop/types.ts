import type { ProductNameFields } from "@/lib/products/product-display-name";

export type ShopSalesUnit = {
  code: string;
  label: string;
  label_ar?: string | null;
};

export type ShopRefOrderUnit = {
  id: string;
  label: string;
  label_ar?: string | null;
  piece_qty: number;
  sort_order: number;
};

/** Option commandable sur la boutique (UdV ou unité vitrine). */
export type ShopOrderOption = {
  /** null = unité de vente du produit. */
  shopOrderUnitId: string | null;
  label: string;
  labelAr?: string | null;
  unitCode: string;
  unitPrice: number;
  /** Équiv. kg pour une unité (null si non applicable). */
  equivKg: number | null;
  isEstimated: boolean;
  qtyStep: number;
};

export type ShopProduct = ProductNameFields & {
  id: string;
  code: string;
  image_path: string | null;
  price: number;
  category_id: string;
  subcategory_id: string | null;
  piece_weight_kg?: number | null;
  shop_allow_sales_unit?: boolean;
  shop_favorite_unit_id?: string | null;
  ref_sales_unit?: ShopSalesUnit | ShopSalesUnit[] | null;
  shop_order_units?: ShopRefOrderUnit[];
};

export type ShopSubcategoryGroup = {
  subcategoryId: string | null;
  subcategoryLabel: string;
  sortOrder: number;
  products: ShopProduct[];
};

export type ShopCategoryGroup = {
  categoryId: string;
  categoryLabel: string;
  sortOrder: number;
  subgroups: ShopSubcategoryGroup[];
};

export type ShopCartLine = {
  productId: string;
  /** null = ligne à l’UdV. */
  shopOrderUnitId: string | null;
  qty: number;
  unitCode: string;
  unitLabel: string;
  priceAtAdd: number;
  /** Pour affichage « soit ~X kg » (unités vitrine). */
  equivKgAtAdd: number | null;
};

export type ShopCartState = {
  lines: ShopCartLine[];
};
