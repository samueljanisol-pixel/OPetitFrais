import RecapClient from "./RecapClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function RecapPage({ params }: PageProps) {
  const { id } = await params;
  return <RecapClient commandeId={id} />;
}
