const STORAGE_KEY = "opf-shop-order-comment-v1";

export function readOrderCommentFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (typeof raw === "string") return raw;
  } catch {
    /* ignore */
  }
  return "";
}

export function writeOrderCommentToStorage(comment: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, comment);
  } catch {
    /* ignore */
  }
}

export function clearOrderCommentStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
