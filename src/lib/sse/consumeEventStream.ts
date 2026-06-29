export type SseHandler = (event: string, data: unknown) => void;

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) as unknown };
  } catch {
    return { event, data: raw };
  }
}

/** Lit un corps `text/event-stream` renvoyé par `fetch`. */
export async function consumeEventStream(response: Response, onEvent: SseHandler): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Réponse sans flux");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = parseSseBlock(trimmed);
      if (parsed) {
        onEvent(parsed.event, parsed.data);
      }
    }
  }
  const tail = buffer.trim();
  if (tail.length > 0) {
    const parsed = parseSseBlock(tail);
    if (parsed) {
      onEvent(parsed.event, parsed.data);
    }
  }
}
