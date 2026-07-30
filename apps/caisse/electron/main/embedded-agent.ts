import { app } from "electron";
import { join } from "node:path";
import { startCaisseAgentServer, stopCaisseAgentServer } from "@caisse-agent/server";

let embeddedStarted = false;

/** Démarre l'agent balance/impression intégré (port 4711). */
export async function startEmbeddedCaisseAgent(): Promise<boolean> {
  if (embeddedStarted) return true;

  try {
    process.env.OPF_EMBEDDED_AGENT = "1";
    process.env.OPF_CONFIG_PATH = join(app.getPath("userData"), "caisse.config.json");

    await startCaisseAgentServer({
      port: Number(process.env.OPF_AGENT_PORT ?? 4711),
      host: "127.0.0.1",
      onError: (err) => {
        if (err.message.includes("EADDRINUSE") || (err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          console.warn("[embedded-agent] port 4711 occupé — agent externe supposé actif");
        } else {
          console.error("[embedded-agent]", err.message);
        }
      },
    });

    embeddedStarted = true;
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      console.warn("[embedded-agent] port 4711 déjà utilisé (agent externe ?)");
      return false;
    }
    console.error("[embedded-agent] démarrage impossible:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function stopEmbeddedCaisseAgent(): Promise<void> {
  if (!embeddedStarted) return;
  await stopCaisseAgentServer();
  embeddedStarted = false;
}
