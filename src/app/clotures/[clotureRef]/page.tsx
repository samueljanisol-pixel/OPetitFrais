import ClotureDetailClient from "@/features/clotures/ClotureDetailClient";

type Props = { params: Promise<{ clotureRef: string }> };

export default async function ClotureDetailPage({ params }: Props) {
  const { clotureRef } = await params;
  return <ClotureDetailClient clotureRef={decodeURIComponent(clotureRef)} />;
}
