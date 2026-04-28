import ParcoursClient from "./ParcoursClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function ParcoursPage({ params }: PageProps) {
  const { id } = await params;
  return <ParcoursClient commandeId={id} />;
}
