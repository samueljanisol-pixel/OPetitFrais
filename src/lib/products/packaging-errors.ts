/** Contrainte unique partielle : (product_id, conditionnement_id, sales_unit_id) si archived_at IS NULL. */

export function isPackagingUniqueViolation(
  message: string | undefined,
  code?: string,
): boolean {
  if (code === "23505") {
    return true;
  }
  return (
    typeof message === "string" &&
    message.includes("product_packaging_product_id_conditionnement_id")
  );
}

export function packagingDbErrorMessage(
  err: { message?: string; code?: string } | null,
): string {
  if (!err) {
    return "Erreur";
  }
  if (isPackagingUniqueViolation(err.message, err.code)) {
    return (
      "Ce conditionnement avec cette unité de vente existe déjà pour ce produit. " +
      "Modifiez la ligne existante (bouton Paramètres) au lieu d’en ajouter une nouvelle."
    );
  }
  return err.message ?? "Erreur";
}

export function hasPackagingCombo(
  lines: Array<{ id?: string; conditionnement_id: string; sales_unit_id: string }>,
  conditionnementId: string,
  salesUnitId: string,
  excludeId?: string,
): boolean {
  return lines.some(
    (p) =>
      p.conditionnement_id === conditionnementId &&
      p.sales_unit_id === salesUnitId &&
      (excludeId == null || p.id !== excludeId),
  );
}
