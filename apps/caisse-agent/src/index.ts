import { startCaisseAgentServer, stopCaisseAgentServer } from "./server.js";

const PORT = Number(process.env.OPF_AGENT_PORT ?? 4711);

async function main(): Promise<void> {
  await startCaisseAgentServer({ port: PORT });
}

function shutdown(): void {
  void stopCaisseAgentServer().then(() => process.exit(0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
