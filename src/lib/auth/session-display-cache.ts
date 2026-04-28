import type { SessionPayload } from "@/lib/auth/session-types";

const KEYS = ["opf.session.snapshot.v2", "opf.session.snapshot.v1"] as const;
const KEY = KEYS[0];

export function readSessionSnapshot(): SessionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    for (const k of KEYS) {
      const raw = sessionStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as SessionPayload;
      if (parsed?.userId) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSessionSnapshot(session: SessionPayload | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session?.userId) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionSnapshot() {
  if (typeof window === "undefined") return;
  try {
    for (const k of KEYS) {
      sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
