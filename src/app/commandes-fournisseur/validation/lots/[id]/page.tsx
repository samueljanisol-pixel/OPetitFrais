import ValidationLotDetailClient from "./ValidationLotDetailClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function ValidationLotPage({ params }: PageProps) {
  const { id } = await params;
  return <ValidationLotDetailClient lotId={id} />;
}
