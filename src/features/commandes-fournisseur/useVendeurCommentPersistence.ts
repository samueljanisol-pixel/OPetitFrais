"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAVE_DEBOUNCE_MS = 700;

function commentForStorage(raw: string): string | null {
  return raw.trim().length === 0 ? null : raw;
}

function commentsEqual(a: string | null, b: string | null): boolean {
  const left = a ?? "";
  const right = b ?? "";
  if (left.trim().length === 0 && right.trim().length === 0) {
    return true;
  }
  return left === right;
}

type LotStatus = "brouillon" | "prete" | string;

type Options = {
  lotId: string;
  lotStatus: LotStatus | null | undefined;
  genericError: string;
  onError?: (message: string) => void;
  onReload?: () => Promise<void>;
};

export function useVendeurCommentPersistence({
  lotId,
  lotStatus,
  genericError,
  onError,
  onReload,
}: Options) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const draftsRef = useRef<Record<string, string>>({});
  const lastSavedRef = useRef<Record<string, string | null>>({});
  const saveGenRef = useRef<Record<string, number>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    const timers = debounceRef.current;
    return () => {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const applyServerDrafts = useCallback((fromServer: Record<string, string>) => {
    setDrafts((prev) => {
      const merged: Record<string, string> = { ...fromServer };
      for (const key of pendingKeysRef.current) {
        merged[key] = prev[key] ?? merged[key] ?? "";
      }
      for (const key of Object.keys(debounceRef.current)) {
        merged[key] = prev[key] ?? merged[key] ?? "";
      }
      draftsRef.current = merged;
      return merged;
    });
    for (const [key, value] of Object.entries(fromServer)) {
      if (!pendingKeysRef.current.has(key) && debounceRef.current[key] === undefined) {
        lastSavedRef.current[key] = commentForStorage(value);
      }
    }
  }, []);

  const persistVendeurComment = useCallback(
    async (vendeurKey: string, nextRaw: string) => {
      if (lotStatus !== "brouillon" && lotStatus !== "prete" && lotStatus !== "achat_en_cours") {
        return;
      }

      const stored = commentForStorage(nextRaw);
      if (commentsEqual(stored, lastSavedRef.current[vendeurKey] ?? null)) {
        pendingKeysRef.current.delete(vendeurKey);
        return;
      }

      const gen = (saveGenRef.current[vendeurKey] ?? 0) + 1;
      saveGenRef.current[vendeurKey] = gen;
      pendingKeysRef.current.add(vendeurKey);
      setSavingKey(vendeurKey);

      try {
        const res = await fetch(`/api/commandes-fournisseur/validation/lots/${lotId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendeurCommentaire: { vendeurKey, commentaire: stored },
          }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(j.error ?? genericError);
        }

        if (saveGenRef.current[vendeurKey] !== gen) {
          return;
        }

        const currentRaw = draftsRef.current[vendeurKey] ?? "";
        if (currentRaw !== nextRaw) {
          if (!commentsEqual(commentForStorage(currentRaw), stored)) {
            void persistVendeurComment(vendeurKey, currentRaw);
          }
          return;
        }

        lastSavedRef.current[vendeurKey] = stored;
        pendingKeysRef.current.delete(vendeurKey);
        setDrafts((prev) => ({
          ...prev,
          [vendeurKey]: stored ?? "",
        }));
      } catch (e) {
        if (saveGenRef.current[vendeurKey] === gen) {
          const message = e instanceof Error ? e.message : genericError;
          onError?.(message);
          await onReload?.();
        }
      } finally {
        if (saveGenRef.current[vendeurKey] === gen) {
          setSavingKey(null);
        }
      }
    },
    [genericError, lotId, lotStatus, onError, onReload],
  );

  const onDraftChange = useCallback(
    (vendeurKey: string, value: string) => {
      draftsRef.current = { ...draftsRef.current, [vendeurKey]: value };
      setDrafts((prev) => ({ ...prev, [vendeurKey]: value }));

      const existing = debounceRef.current[vendeurKey];
      if (existing) {
        clearTimeout(existing);
      }
      debounceRef.current[vendeurKey] = setTimeout(() => {
        delete debounceRef.current[vendeurKey];
        void persistVendeurComment(vendeurKey, draftsRef.current[vendeurKey] ?? value);
      }, SAVE_DEBOUNCE_MS);
    },
    [persistVendeurComment],
  );

  const onDraftBlur = useCallback(
    (vendeurKey: string, value: string) => {
      const existing = debounceRef.current[vendeurKey];
      if (existing) {
        clearTimeout(existing);
        delete debounceRef.current[vendeurKey];
      }
      draftsRef.current = { ...draftsRef.current, [vendeurKey]: value };
      setDrafts((prev) => ({ ...prev, [vendeurKey]: value }));
      void persistVendeurComment(vendeurKey, value);
    },
    [persistVendeurComment],
  );

  return {
    drafts,
    savingKey,
    applyServerDrafts,
    onDraftChange,
    onDraftBlur,
  };
}
