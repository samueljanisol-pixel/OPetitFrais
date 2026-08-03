import SalarieDetailClient from "./SalarieDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SalarieDetailPage({ params }: Props) {
  const { id } = await params;
  return <SalarieDetailClient salarieId={id} />;
}
