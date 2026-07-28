import { NextResponse } from "next/server";
import { EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE } from "@/lib/emballages/constants";

export const ACHATS_DISABLED_MESSAGE =
  "Les achats emballages passent par Commandes fournisseur (saisie → validation → achat → comptes).";

export function achatsMutationsDisabledResponse() {
  return NextResponse.json(
    {
      error: ACHATS_DISABLED_MESSAGE,
      redirect: `/commandes-fournisseur/saisie/nouvelle?supplier=${EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE}`,
    },
    { status: 410 },
  );
}
