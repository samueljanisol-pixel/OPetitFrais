import { Suspense } from "react";
import ParcoursClient from "./ParcoursClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function ParcoursPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<p className="px-4 py-4 text-slate-600">Chargement du parcours…</p>}>
        <ParcoursClient commandeId={id} />
      </Suspense>
    </div>
  );
}
