import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  runExportProductPhotosToFtp,
  uploadProductPhotosZipToFtp,
  type ExportPhotosToFtpResult,
} from "@/lib/products/importPhotosFromFtp";
import { FTP_ARCHIVE_NAME } from "@/lib/products/product-photo-ftp";

export const runtime = "nodejs";
export const maxDuration = 300;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

export async function POST(req: Request) {
  const gate = await requireApiPermission("produits.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const archive = formData.get("archive");
    if (!(archive instanceof Blob)) {
      return NextResponse.json({ error: "Archive ZIP manquante." }, { status: 400 });
    }

    const buf = Buffer.from(await archive.arrayBuffer());
    const result = await uploadProductPhotosZipToFtp(buf);
    return NextResponse.json(result);
  }

  const streamState = { closed: false };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (streamState.closed) return;
        try {
          controller.enqueue(enc.encode(sseEvent(event, data)));
        } catch {
          streamState.closed = true;
        }
      };

      void (async () => {
        try {
          const result: ExportPhotosToFtpResult = await runExportProductPhotosToFtp({
            onProgress: (p) => send("progress", p),
          });
          send("done", { ...result, archiveName: FTP_ARCHIVE_NAME });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send("error", { error: message });
        } finally {
          streamState.closed = true;
          try {
            controller.close();
          } catch {
            /* flux déjà fermé */
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
