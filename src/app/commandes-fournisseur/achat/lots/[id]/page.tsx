import AchatLotDetailClient from "./AchatLotDetailClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function AchatLotDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <AchatLotDetailClient lotId={id} />;
}
