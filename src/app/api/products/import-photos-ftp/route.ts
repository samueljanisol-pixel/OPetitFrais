import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  runImportProductPhotosFromFtp,
  type ImportPhotosFromFtpResult,
} from "@/lib/products/importPhotosFromFtp";

export const runtime = "nodejs";

/** Import FTP + extraction RAR peut dépasser la limite serverless par défaut. */
export const maxDuration = 300;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

export async function POST() {
  const gate = await requireApiPermission("produits.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const streamState = { closed: false };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (streamState.closed) {
          return;
        }
        try {
          controller.enqueue(enc.encode(sseEvent(event, data)));
        } catch {
          streamState.closed = true;
        }
      };

      void (async () => {
        try {
          const result: ImportPhotosFromFtpResult = await runImportProductPhotosFromFtp({
            onProgress: (p) => send("progress", p),
          });
          send("done", result);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send("error", { error: message });
        } finally {
          streamState.closed = true;
          try {
            controller.close();
          } catch {
            /* flux déjà fermé côté client */
          }
        }
      })();
    },
    cancel() {
      streamState.closed = true;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
