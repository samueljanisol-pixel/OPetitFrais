import type { AppLocale } from "@/i18n/config";
import { applyMessageOverrides, getBaseMessages } from "@/lib/i18n/message-catalog";

const cache = new Map<AppLocale, Record<string, unknown>>();

async function fetchOverrides(locale: AppLocale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`/api/ref/ui-translations/overrides?locale=${encodeURIComponent(locale)}`, {
      credentials: "include",
    });
    if (!res.ok) return {};
    const j = (await res.json()) as { overrides?: Record<string, string> };
    return j.overrides ?? {};
  } catch {
    return {};
  }
}

export async function loadMessages(locale: AppLocale): Promise<Record<string, unknown>> {
  const hit = cache.get(locale);
  if (hit) return hit;

  const base = getBaseMessages(locale);
  const overrides = await fetchOverrides(locale);
  const messages = applyMessageOverrides(base, overrides);
  cache.set(locale, messages);
  return messages;
}

/** Précharge l'autre locale pour un basculement quasi instantané. */
export function preloadMessages(locale: AppLocale): void {
  void loadMessages(locale);
}

export function seedMessagesCache(locale: AppLocale, messages: Record<string, unknown>): void {
  cache.set(locale, messages);
}

export function clearMessagesCache(locale?: AppLocale): void {
  if (locale) {
    cache.delete(locale);
    return;
  }
  cache.clear();
}
