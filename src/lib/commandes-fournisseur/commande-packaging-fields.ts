/** Champs product_packaging communs aux API commandes fournisseur (saisie / parcours). */
export const COMMANDE_PACKAGING_SELECT =
  "id, conditionnement_id, quantity, nom, available_for_sale, available_for_purchase, ref_conditionnement(label, code, supplier_id), ref_sales_unit(label, code), product_packaging_magasin(magasin_id, sellable, purchasable), product_packaging_supplier(supplier_id)";
