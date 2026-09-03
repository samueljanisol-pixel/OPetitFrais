import { hashCaissePin, isValidCaissePin } from "./caisse-pin";

export function parseOptionalCaissePin(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function parseIsCaissier(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined;
}

export async function resolveCaissePinHash(opts: {
  isCaissier: boolean;
  pin: string;
  existingHash: string | null;
  requirePinIfNew: boolean;
}): Promise<{ ok: true; hash: string | null } | { ok: false; error: string }> {
  if (!opts.isCaissier) {
    return { ok: true, hash: null };
  }

  if (opts.pin.length > 0) {
    if (!isValidCaissePin(opts.pin)) {
      return { ok: false, error: "Code caisse : 4 à 8 chiffres" };
    }
    return { ok: true, hash: await hashCaissePin(opts.pin) };
  }

  if (opts.existingHash) {
    return { ok: true, hash: opts.existingHash };
  }

  if (opts.requirePinIfNew) {
    return { ok: false, error: "Code caisse requis (4 à 8 chiffres)" };
  }

  return { ok: false, error: "Code caisse requis (4 à 8 chiffres)" };
}
