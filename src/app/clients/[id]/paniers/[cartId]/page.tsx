import ClientPanierDetailClient from "@/features/clients/ClientPanierDetailClient";

type Props = {
  params: Promise<{ id: string; cartId: string }>;
};

export default async function ClientPanierDetailPage({ params }: Props) {
  const { id, cartId } = await params;
  return <ClientPanierDetailClient clientId={id} cartId={cartId} />;
}
