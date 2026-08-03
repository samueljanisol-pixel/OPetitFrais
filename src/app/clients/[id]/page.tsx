import ClientDetailClient from "@/features/clients/ClientDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  return <ClientDetailClient clientId={id} />;
}
