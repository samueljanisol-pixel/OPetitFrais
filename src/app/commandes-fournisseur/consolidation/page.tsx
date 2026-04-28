import { redirect } from "next/navigation";

/** Ancien chemin : la validation fournisseur est sous /validation. */
export default function ConsolidationRedirectPage() {
  redirect("/commandes-fournisseur/validation");
}
