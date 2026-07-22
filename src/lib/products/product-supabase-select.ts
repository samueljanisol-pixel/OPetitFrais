/**
 * Embeds Supabase pour `product` — FK explicites requis après la table `product_supplier`
 * (sinon PostgREST : « more than one relationship was found for product and ref_supplier »).
 */

import { COMMANDE_PACKAGING_SELECT } from "@/lib/commandes-fournisseur/commande-packaging-fields";

/** Fournisseur principal : `product.supplier_id` → `ref_supplier`. */
export const PRODUCT_PRIMARY_SUPPLIER_EMBED = "ref_supplier!product_supplier_id_fkey";

/** Produit depuis `product_supplier` : `product_supplier.product_id` → `product`. */
export const PRODUCT_SUPPLIER_PRODUCT_EMBED = "product!product_supplier_product_id_fkey";

export const PRODUCT_LIST_SELECT = `*, ref_sales_unit(*), ref_category(*), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(*)`;

export const PRODUCT_FORM_SELECT = `*, ref_sales_unit(*), ref_category(*), ref_subcategory(*), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(*)`;

export const PRODUCT_CATALOG_MATCH_SELECT = `id, code, name, category_id, supplier_id, ref_category(id, label), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(id, label), ref_sales_unit(label, code)`;

export const PRODUCT_COMMANDE_SEARCH_SELECT = `id, code, name, name_ar, category_id, supplier_id, allow_unit_in_commande, ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(code, label), ref_category(label, sort_order), ref_sales_unit(label, label_ar, code), product_packaging(${COMMANDE_PACKAGING_SELECT})`;

export const PRODUCT_SHEET_EXPORT_SELECT = `code, name, price, margin, active, name_ar, ref_sales_unit (label), ref_category (label), ref_subcategory (label), ${PRODUCT_PRIMARY_SUPPLIER_EMBED} (label), ref_supplier_vendeur (label)`;
