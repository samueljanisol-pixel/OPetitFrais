import type { SessionPayload } from "@/lib/auth/session-types";

const KEY = "opf.session.snapshot.v1";

export function readSessionSnapshot(): SessionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionPayload;
    return parsed?.userId ? parsed : null;
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
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
