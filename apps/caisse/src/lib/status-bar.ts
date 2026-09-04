import { useEffect, useState } from "react";
import { getCaisseConfig } from "./catalog";

const CHECK_INTERVAL_MS = 20_000;
const CHECK_TIMEOUT_MS = 4_000;

/** Ping externe — vérifie une vraie sortie internet (pas seulement le LAN). */
const INTERNET_PROBE_URL = "https://www.gstatic.com/generate_204";

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function useInternetStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : false,
  );

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setOnline(false);
        return;
      }

      try {
        const res = await fetchWithTimeout(INTERNET_PROBE_URL, { method: "GET" });
        if (!cancelled) setOnline(res.ok || res.status === 204);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    void check();
    const intervalId = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    const handleOnline = () => void check();
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

/** Serveur backoffice / API caisse joignable. */
export function useApiServerStatus(backofficeUrl: string | null): boolean {
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setReachable(false);
        return;
      }

      let baseUrl = backofficeUrl?.trim().replace(/\/$/, "") ?? "";
      if (!baseUrl) {
        try {
          const config = await getCaisseConfig();
          baseUrl = config.backofficeUrl.trim().replace(/\/$/, "");
        } catch {
          if (!cancelled) setReachable(false);
          return;
        }
      }

      if (!baseUrl) {
        if (!cancelled) setReachable(false);
        return;
      }

      try {
        const res = await fetchWithTimeout(`${baseUrl}/api/caisse/catalog`, { method: "OPTIONS" });
        if (!cancelled) setReachable(res.ok || res.status === 204);
      } catch {
        if (!cancelled) setReachable(false);
      }
    };

    void check();
    const intervalId = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    const handleOnline = () => void check();
    const handleOffline = () => setReachable(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [backofficeUrl]);

  return reachable;
}

export type SaurusScaleStatus = {
  configured: boolean;
  connected: boolean;
};

/** Balance étiqueteuse SAURUS (UDP port 5001) — ping via process main Electron. */
export function useSaurusScaleStatus(): SaurusScaleStatus {
  const [status, setStatus] = useState<SaurusScaleStatus>({ configured: false, connected: false });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!window.caisseApi?.pingSaurusScale) {
        if (!cancelled) setStatus({ configured: false, connected: false });
        return;
      }

      try {
        const result = await window.caisseApi.pingSaurusScale();
        if (!cancelled) {
          setStatus({
            configured: result.configured,
            connected: result.configured && result.ok,
          });
        }
      } catch {
        if (!cancelled) setStatus({ configured: false, connected: false });
      }
    };

    void check();
    const intervalId = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return status;
}

export function useClock(now = new Date()): Date {
  const [current, setCurrent] = useState(now);

  useEffect(() => {
    const id = window.setInterval(() => setCurrent(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return current;
}

export function formatCashierClock(date: Date): string {
  return date.toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Affiche « Magasin : XX - Caisse : XX » à partir des codes config. */
export function formatMagasinCaisseLabel(magasinCode: string, caisseCode: string): string {
  const magasin = magasinCode.trim().replace(/^M/i, "") || "—";
  const caisse = caisseCode.trim().replace(/^C/i, "") || "—";
  return `Magasin : ${magasin} - Caisse : ${caisse}`;
}

export function useSupabaseQueueCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.caisseApi?.getSupabaseQueueCount?.().then((n) => {
      if (!cancelled && typeof n === "number" && Number.isFinite(n)) setCount(n);
    });
    const stop = window.caisseApi?.onSupabaseQueueCount?.((n) => {
      if (typeof n === "number" && Number.isFinite(n)) setCount(n);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return count;
}
