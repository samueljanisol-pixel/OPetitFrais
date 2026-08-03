import CommandePreparationClient from "@/features/commandes-client/CommandePreparationClient";

type Props = { params: Promise<{ id: string }> };

export default async function CommandePreparationDetailPage({ params }: Props) {
  const { id } = await params;
  return <CommandePreparationClient cartId={id} />;
}
