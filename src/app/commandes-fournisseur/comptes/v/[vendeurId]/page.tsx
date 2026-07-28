import CompteDetailClient from "@/features/commandes-fournisseur/CompteDetailClient";

type Props = { params: Promise<{ vendeurId: string }> };

export default async function CompteVendeurPage({ params }: Props) {
  const { vendeurId } = await params;
  return <CompteDetailClient accountType="vendeur" accountId={vendeurId} />;
}
