"use client";

import { usePathname } from "next/navigation";
import { shopRoutesFromPathname } from "@/lib/shop/shop-routes";

export function useShopRoutes() {
  const pathname = usePathname();
  return shopRoutesFromPathname(pathname);
}
