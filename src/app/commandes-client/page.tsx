import { Suspense } from "react";
import CommandesClientListClient from "@/features/commandes-client/CommandesClientListClient";

export default function CommandesClientPage() {
  return (
    <Suspense fallback={null}>
      <CommandesClientListClient />
    </Suspense>
  );
}
