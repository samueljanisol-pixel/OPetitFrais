import type { CaisseHardwareConfig } from "../../electron/preload/index";

const AGENT_BASE = "http://127.0.0.1:4711";

export type WeightResponse = {
  weightKg: number;
  weightGrams: number;
  stable: boolean;
  source: string;
  connected?: boolean;
  error?: string | null;
};

function parseWeightPayload(json: Record<string, unknown>): WeightResponse {
  return {
    weightKg: typeof json.weightKg === "number" ? json.weightKg : 0,
    weightGrams: typeof json.weightGrams === "number" ? json.weightGrams : 0,
    stable: json.stable === true,
    source: typeof json.source === "string" ? json.source : "unknown",
    connected: json.connected === true,
    error: typeof json.error === "string" ? json.error : null,
  };
}

export async function fetchWeight(): Promise<WeightResponse> {
  try {
    const res = await fetch(`${AGENT_BASE}/weight`);
    if (!res.ok) {
      return { weightKg: 0, weightGrams: 0, stable: false, source: "error", connected: false };
    }
    const json = (await res.json()) as Record<string, unknown>;
    return parseWeightPayload(json);
  } catch {
    return { weightKg: 0, weightGrams: 0, stable: false, source: "offline", connected: false };
  }
}

export async function reconnectScale(): Promise<WeightResponse> {
  try {
    const res = await fetch(`${AGENT_BASE}/weight/reconnect`, { method: "POST" });
    if (!res.ok) {
      return { weightKg: 0, weightGrams: 0, stable: false, source: "error", connected: false };
    }
  } catch {
    return { weightKg: 0, weightGrams: 0, stable: false, source: "offline", connected: false };
  }
  return fetchWeight();
}

export async function reconnectScaleWithPort(scalePort: string): Promise<WeightResponse> {
  try {
    const res = await fetch(`${AGENT_BASE}/weight/reconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scalePort }),
    });
    if (!res.ok) {
      return { weightKg: 0, weightGrams: 0, stable: false, source: "error", connected: false };
    }
  } catch {
    return { weightKg: 0, weightGrams: 0, stable: false, source: "offline", connected: false };
  }
  return fetchWeight();
}

export type AgentHardwareConfig = {
  scalePort: string;
  ticketPrinter: string;
};

export async function fetchAgentHardwareConfig(): Promise<AgentHardwareConfig> {
  try {
    const res = await fetch(`${AGENT_BASE}/config/hardware`);
    if (!res.ok) {
      return { scalePort: "", ticketPrinter: "" };
    }
    const json = (await res.json()) as Record<string, unknown>;
    return {
      scalePort: typeof json.scalePort === "string" ? json.scalePort : "",
      ticketPrinter: typeof json.ticketPrinter === "string" ? json.ticketPrinter : "",
    };
  } catch {
    return { scalePort: "", ticketPrinter: "" };
  }
}

export async function applyHardwareConfigOnAgent(
  partial: CaisseHardwareConfig,
): Promise<AgentHardwareConfig> {
  try {
    const res = await fetch(`${AGENT_BASE}/config/hardware`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
    }
    return {
      scalePort: typeof json.scalePort === "string" ? json.scalePort : "",
      ticketPrinter: typeof json.ticketPrinter === "string" ? json.ticketPrinter : "",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent indisponible";
    throw new Error(msg);
  }
}

export type SerialPortOption = {
  path: string;
  manufacturer: string | null;
};

export async function fetchSerialPorts(): Promise<SerialPortOption[]> {
  try {
    const res = await fetch(`${AGENT_BASE}/serial/ports`);
    if (!res.ok) return [];
    const json = (await res.json()) as { ports?: Array<Record<string, unknown>> };
    return (json.ports ?? [])
      .map((p) => ({
        path: typeof p.path === "string" ? p.path : "",
        manufacturer: typeof p.manufacturer === "string" ? p.manufacturer : null,
      }))
      .filter((p) => p.path.length > 0);
  } catch {
    return [];
  }
}

export async function fetchPrinters(): Promise<string[]> {
  try {
    const res = await fetch(`${AGENT_BASE}/printers`);
    if (!res.ok) return [];
    const json = (await res.json()) as { printers?: unknown };
    if (!Array.isArray(json.printers)) return [];
    return json.printers.filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}

/** Polling 150 ms + SSE si disponible. */
export function subscribeWeight(onUpdate: (w: WeightResponse) => void): () => void {
  let stopped = false;
  let pollId: ReturnType<typeof setInterval> | null = null;
  let es: EventSource | null = null;

  const poll = async () => {
    if (stopped) return;
    onUpdate(await fetchWeight());
  };

  void poll();
  pollId = setInterval(poll, 150);

  try {
    es = new EventSource(`${AGENT_BASE}/weight/stream`);
    es.onmessage = (ev) => {
      try {
        onUpdate(parseWeightPayload(JSON.parse(ev.data as string) as Record<string, unknown>));
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es?.close();
      es = null;
    };
  } catch {
    /* polling only */
  }

  return () => {
    stopped = true;
    es?.close();
    if (pollId) clearInterval(pollId);
  };
}

export async function sendTare(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_BASE}/weight/tare`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function printEscPosBase64(
  dataBase64: string,
  options?: { ticketPrinter?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const body: { dataBase64: string; ticketPrinter?: string } = { dataBase64 };
    const printer = options?.ticketPrinter?.trim();
    if (printer && printer.length > 0) {
      body.ticketPrinter = printer;
    }

    const res = await fetch(`${AGENT_BASE}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof json.error === "string" && json.error.length > 0
          ? json.error
          : res.status === 503
            ? "Agent caisse indisponible — lancez npm run dev:caisse-agent"
            : `Impression refusée (HTTP ${res.status})`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Agent caisse indisponible — lancez npm run dev:caisse-agent" };
  }
}

export async function setMockWeightKg(weightKg: number): Promise<void> {
  await fetch(`${AGENT_BASE}/weight/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weightKg }),
  });
}
