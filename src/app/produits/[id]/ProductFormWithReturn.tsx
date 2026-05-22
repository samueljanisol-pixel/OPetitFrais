"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProductFormClient from "@/app/produits/ProductFormClient";
import { safeReturnPath } from "@/lib/navigation/safe-return-path";

function ProductFormWithReturnInner({ productId }: { productId: string }) {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  return <ProductFormClient productId={productId} returnTo={returnTo} />;
}

export default function ProductFormWithReturn({ productId }: { productId: string }) {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <p className="text-slate-600">Chargement…</p>
        </div>
      }
    >
      <ProductFormWithReturnInner productId={productId} />
    </Suspense>
  );
}
