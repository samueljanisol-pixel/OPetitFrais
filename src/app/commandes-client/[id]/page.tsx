import CommandeClientEditClient from "@/features/commandes-client/CommandeClientEditClient";

type Props = { params: Promise<{ id: string }> };

export default async function CommandeClientDetailPage({ params }: Props) {
  const { id } = await params;
  return <CommandeClientEditClient cartId={id} />;
}
