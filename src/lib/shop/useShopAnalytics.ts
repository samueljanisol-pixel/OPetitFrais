"use client";

import { useEffect, useRef } from "react";
import { getOrCreateShopVisitorKey, sendShopHeartbeat } from "@/lib/shop/analytics-client";
import type { ShopCartLine } from "@/lib/shop/types";

type Options = {
  lines: ShopCartLine[];
  hydrated: boolean;
};

export function useShopAnalytics({ lines, hydrated }: Options): void {
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    if (!hydrated) return;

    const visitorKey = getOrCreateShopVisitorKey();
    if (!visitorKey) return;

    let cancelled = false;

    const push = () => {
      if (cancelled) return;
      const current = linesRef.current;
      const lineCount = current.length;
      const totalAmount = current.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0);
      void sendShopHeartbeat({ visitorKey, lineCount, totalAmount });
    };

    push();
    const interval = window.setInterval(push, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const visitorKey = getOrCreateShopVisitorKey();
    if (!visitorKey) return;

    const timer = window.setTimeout(() => {
      const lineCount = lines.length;
      const totalAmount = lines.reduce((sum, l) => sum + l.qty * l.priceAtAdd, 0);
      void sendShopHeartbeat({ visitorKey, lineCount, totalAmount });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [lines, hydrated]);
}
