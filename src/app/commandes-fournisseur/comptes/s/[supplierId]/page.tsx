import CompteDetailClient from "@/features/commandes-fournisseur/CompteDetailClient";

type Props = { params: Promise<{ supplierId: string }> };

export default async function CompteStationPage({ params }: Props) {
  const { supplierId } = await params;
  return <CompteDetailClient accountType="station" accountId={supplierId} />;
}
