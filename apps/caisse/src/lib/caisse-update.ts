import { useEffect, useState } from "react";
import type { CaisseUpdateState } from "../../electron/preload/index";

const DEFAULT_STATE: CaisseUpdateState = {
  phase: "idle",
  currentVersion: "0.0.0",
  latestVersion: null,
  updateAvailable: false,
  progressPercent: null,
  error: null,
  installerReady: false,
};

export function useCaisseUpdate(): CaisseUpdateState {
  const [state, setState] = useState<CaisseUpdateState>(DEFAULT_STATE);

  useEffect(() => {
    if (!window.caisseApi?.getUpdateState) return;

    void window.caisseApi.getUpdateState().then(setState);

    const unsub = window.caisseApi.onUpdateState?.((next) => {
      setState(next);
    });

    return () => {
      unsub?.();
    };
  }, []);

  return state;
}

export async function checkForUpdate(): Promise<CaisseUpdateState> {
  if (!window.caisseApi?.checkForUpdate) {
    return DEFAULT_STATE;
  }
  return window.caisseApi.checkForUpdate();
}

export async function installCaisseUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!window.caisseApi?.installUpdate) {
    return { ok: false, error: "Mise à jour indisponible" };
  }
  return window.caisseApi.installUpdate();
}
