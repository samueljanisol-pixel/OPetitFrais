import type { ProductNameFields } from "@/lib/products/product-display-name";

export type ShopSalesUnit = {
  code: string;
  label: string;
  label_ar?: string | null;
};

export type ShopProduct = ProductNameFields & {
  id: string;
  code: string;
  image_path: string | null;
  price: number;
  category_id: string;
  subcategory_id: string | null;
  ref_sales_unit?: ShopSalesUnit | ShopSalesUnit[] | null;
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
  qty: number;
  unitCode: string;
  priceAtAdd: number;
};

export type ShopCartState = {
  lines: ShopCartLine[];
};
