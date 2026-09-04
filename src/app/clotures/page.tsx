import { Suspense } from "react";
import CloturesListClient from "@/features/clotures/CloturesListClient";

export default function CloturesPage() {
  return (
    <Suspense fallback={null}>
      <CloturesListClient />
    </Suspense>
  );
}
