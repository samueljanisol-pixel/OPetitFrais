"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Sans offline: SW "network-only" (pas de cache), juste pour rendre l'app installable.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}

