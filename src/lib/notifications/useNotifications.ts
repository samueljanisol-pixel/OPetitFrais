"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ClientNotification = {
  id: string;
  type_key: string;
  title: string;
  body: string;
  link_url: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const POLL_MS = 30_000;

export function useNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        notifications: ClientNotification[];
        unreadCount: number;
      };
      if (!mountedRef.current) return;
      setNotifications(json.notifications ?? []);
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      /* ignore network errors during poll */
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(id);
    };
  }, [enabled, refresh]);

  const markRead = useCallback(async (id: string) => {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!res.ok) return false;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    return true;
  }, []);

  const markAllRead = useCallback(async () => {
    const res = await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setUnreadCount(0);
    return true;
  }, []);

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
