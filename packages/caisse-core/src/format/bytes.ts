/** Concatène des octets ESC/POS (compatible navigateur / Node). */
export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function encodeLatin1(text: string): Uint8Array {
  const safe = text.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "?");
  const out = new Uint8Array(safe.length);
  for (let i = 0; i < safe.length; i++) {
    out[i] = safe.charCodeAt(i) & 0xff;
  }
  return out;
}

export function bytesToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}
