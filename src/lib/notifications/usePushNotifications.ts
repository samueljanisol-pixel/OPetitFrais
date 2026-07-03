"use client";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushSupport = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  isIos: boolean;
  isStandalone: boolean;
  /** false si HTTP sur une IP/réseau (push exige localhost ou HTTPS). */
  contextOk: boolean;
};

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return {
      supported: false,
      permission: "unsupported",
      isIos: false,
      isStandalone: false,
      contextOk: false,
    };
  }
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

  const { protocol, hostname } = window.location;
  const contextOk =
    window.isSecureContext &&
    (protocol === "https:" || isLocalhostHost(hostname));

  const supported =
    contextOk &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  return {
    supported,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    isIos,
    isStandalone,
    contextOk,
  };
}

function pushSubscribeErrorCode(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "AbortError" || err.message.toLowerCase().includes("push service not available")) {
      return "push_service_unavailable";
    }
    if (err.name === "NotAllowedError") return "denied";
  }
  if (err instanceof Error && err.message.toLowerCase().includes("push service not available")) {
    return "push_service_unavailable";
  }
  return "subscribe_failed";
}

export async function subscribeToPush(vapidPublicKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const support = getPushSupport();
  if (!support.contextOk) {
    return { ok: false, error: "insecure_context" };
  }
  if (!support.supported) {
    return { ok: false, error: "unsupported" };
  }
  if (support.isIos && !support.isStandalone) {
    return { ok: false, error: "ios_requires_install" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, error: "denied" };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, error: "invalid_subscription" };
    }

    const res = await fetch("/api/notifications/push/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? "subscribe_failed" };
    }

    return { ok: true };
  } catch (err) {
    console.warn("[notifications] push subscribe:", err);
    return { ok: false, error: pushSubscribeErrorCode(err) };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch(`/api/notifications/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        credentials: "include",
      });
    }
  } catch (err) {
    console.warn("[notifications] push unsubscribe:", err);
  }
}
