export const EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE = "emballages_consommables";

/** Catégorie produit des articles miroir (sync emballages). */
export const EMBALLAGES_CONSOMMABLES_PRODUCT_CATEGORY_CODE = "emballages_consommables";

export type EmballageCategorieCode = "emballages" | "etiquettes" | "consommable";

export const EMBALLAGE_CATEGORIE_CODES: EmballageCategorieCode[] = [
  "emballages",
  "etiquettes",
  "consommable",
];

export function isEmballageCategorieCode(value: string): value is EmballageCategorieCode {
  return EMBALLAGE_CATEGORIE_CODES.includes(value as EmballageCategorieCode);
}
