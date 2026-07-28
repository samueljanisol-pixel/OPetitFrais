/**
 * Embeds Supabase pour `product` — FK explicites requis après la table `product_supplier`
 * (sinon PostgREST : « more than one relationship was found for product and ref_supplier »).
 */

import { COMMANDE_PACKAGING_SELECT } from "@/lib/commandes-fournisseur/commande-packaging-fields";

/** Emballage produit : `product.emballage_id` → `ref_emballage`. */
export const PRODUCT_EMBALLAGE_EMBED = "ref_emballage!product_emballage_id_fkey";

/** Étiquette produit : `product.etiquette_id` → `ref_emballage`. */
export const PRODUCT_ETIQUETTE_EMBED = "ref_emballage!product_etiquette_id_fkey";

/** Fournisseur principal : `product.supplier_id` → `ref_supplier`. */
export const PRODUCT_PRIMARY_SUPPLIER_EMBED = "ref_supplier!product_supplier_id_fkey";

/** Favori boutique : `product.shop_favorite_unit_id` → `ref_shop_order_unit` (évite l’ambiguïté avec `product_shop_order_unit`). */
export const PRODUCT_SHOP_FAVORITE_UNIT_EMBED =
  "ref_shop_order_unit!product_shop_favorite_unit_id_fkey";

/** Produit depuis `product_supplier` : `product_supplier.product_id` → `product`. */
export const PRODUCT_SUPPLIER_PRODUCT_EMBED = "product!product_supplier_product_id_fkey";

export const PRODUCT_LIST_SELECT = `*, ref_sales_unit(*), ref_category(*), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(*)`;

/** Liste produits avec embeds pour édition inline (colonnes configurables). */
export const PRODUCT_LIST_EXTENDED_SELECT = `*, ref_sales_unit(*), ref_order_unit(*), ref_purchase_unit(*), ref_category(*), ref_subcategory(*), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(*), ref_supplier_vendeur(id, supplier_id, label, sort_order), emballage_ref:${PRODUCT_EMBALLAGE_EMBED}(id, label, type_id, ref_emballage_type(id, label)), etiquette_ref:${PRODUCT_ETIQUETTE_EMBED}(id, label, reference), ${PRODUCT_SHOP_FAVORITE_UNIT_EMBED}(id, code, label, sort_order)`;

export const PRODUCT_FORM_SELECT = `*, ref_sales_unit(*), ref_order_unit(*), ref_purchase_unit(*), ref_category(*), ref_subcategory(*), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(*)`;

export const PRODUCT_CATALOG_MATCH_SELECT = `id, code, name, category_id, supplier_id, ref_category(id, label), ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(id, label), ref_sales_unit(label, code)`;

export const PRODUCT_COMMANDE_SEARCH_SELECT = `id, code, name, name_ar, category_id, supplier_id, allow_unit_in_commande, ${PRODUCT_PRIMARY_SUPPLIER_EMBED}(code, label), ref_category(label, sort_order), ref_sales_unit(label, label_ar, code), ref_order_unit(label, label_ar, code), product_packaging(${COMMANDE_PACKAGING_SELECT})`;

export const PRODUCT_SHEET_EXPORT_SELECT = `code, name, price, cost_purchase, active, name_ar, ref_sales_unit (label), ref_category (label, code), ref_subcategory (label), ${PRODUCT_PRIMARY_SUPPLIER_EMBED} (label, code)`;
