"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const ShopLivraisonMap = dynamic(() => import("@/lib/shop/map/ShopLivraisonMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] w-full items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/40 text-sm text-slate-600">
      Chargement de la carte…
    </div>
  ),
});

export default function ShopLivraisonMapDynamic(props: ComponentProps<typeof ShopLivraisonMap>) {
  return <ShopLivraisonMap {...props} />;
}
