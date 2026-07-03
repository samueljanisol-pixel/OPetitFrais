"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Paper,
  Switch,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { subscribeToPush, unsubscribeFromPush, getPushSupport } from "@/lib/notifications/usePushNotifications";
import type { NotificationTypeKey } from "@/lib/notifications/types";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type PreferenceItem = {
  typeKey: NotificationTypeKey;
  permission: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
};

export default function NotificationPreferencesClient() {
  const t = useTranslations("backoffice.notifications");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: sessionLoading, can } = useSessionPermissions();
  const [preferences, setPreferences] = useState<PreferenceItem[]>([]);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const pushSupport = getPushSupport();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", { credentials: "include" });
      const json = (await res.json()) as {
        preferences: PreferenceItem[];
        pushConfigured: boolean;
        vapidPublicKey: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? tCommon("error"));
        return;
      }
      setPreferences(json.preferences ?? []);
      setPushConfigured(json.pushConfigured ?? false);
      setVapidPublicKey(json.vapidPublicKey);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [tCommon]);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePreference = useCallback(
    async (typeKey: NotificationTypeKey, patch: { inAppEnabled?: boolean; pushEnabled?: boolean }) => {
      setSaving(typeKey);
      setPushMessage(null);
      setError(null);

      const current = preferences.find((p) => p.typeKey === typeKey);
      if (!current) return;

      const nextInApp = patch.inAppEnabled ?? current.inAppEnabled;
      let nextPush = patch.pushEnabled ?? current.pushEnabled;

      if (patch.pushEnabled === true) {
        if (!pushConfigured || !vapidPublicKey) {
          setPushMessage(t("pushNotConfigured"));
          setSaving(null);
          return;
        }
        const sub = await subscribeToPush(vapidPublicKey);
        if (!sub.ok) {
          if (sub.error === "ios_requires_install") {
            setPushMessage(t("iosInstallHint"));
          } else if (sub.error === "denied") {
            setPushMessage(t("pushDenied"));
          } else if (sub.error === "unsupported") {
            setPushMessage(t("pushUnsupported"));
          } else if (sub.error === "insecure_context") {
            setPushMessage(t("pushInsecureContext"));
          } else if (sub.error === "push_service_unavailable") {
            setPushMessage(t("pushServiceUnavailable"));
          } else {
            setPushMessage(t("pushSubscribeError"));
          }
          nextPush = false;
        }
      } else if (patch.pushEnabled === false) {
        await unsubscribeFromPush();
      }

      try {
        const res = await fetch("/api/notifications/preferences", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            typeKey,
            inAppEnabled: nextInApp,
            pushEnabled: nextPush,
          }),
        });
        const json = (await res.json()) as { error?: string; preference?: PreferenceItem };
        if (!res.ok) {
          setError(json.error ?? tCommon("error"));
          return;
        }
        if (json.preference) {
          setPreferences((prev) =>
            prev.map((p) => (p.typeKey === typeKey ? { ...p, ...json.preference! } : p)),
          );
        }
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setSaving(null);
      }
    },
    [preferences, pushConfigured, vapidPublicKey, t, tCommon],
  );

  if (sessionLoading || loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-6">
        <CircularProgress color="success" />
      </main>
    );
  }

  const hasAccess = can("commandes_fournisseur.consolidation");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <AppLink href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-emerald-800 hover:underline">
        <BackChevron fontSize="small" />
        {tCommon("home")}
      </AppLink>

      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        {t("settingsTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("settingsSubtitle")}
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {pushMessage ? (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setPushMessage(null)}>
          {pushMessage}
        </Alert>
      ) : null}
      {pushSupport.isIos && !pushSupport.isStandalone ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("iosInstallHint")}
        </Alert>
      ) : null}
      {!pushSupport.contextOk ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("pushInsecureContext")}
        </Alert>
      ) : null}

      {!hasAccess || preferences.length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, border: 1, borderColor: "divider", borderRadius: 2 }}>
          <Typography color="text.secondary">{t("noTypesAvailable")}</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {preferences.map((pref) => (
            <Paper
              key={pref.typeKey}
              elevation={0}
              sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
                {t(`types.${pref.typeKey}.label`)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {t(`types.${pref.typeKey}.description`)}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={pref.inAppEnabled}
                    disabled={saving === pref.typeKey}
                    onChange={(e) =>
                      void updatePreference(pref.typeKey, { inAppEnabled: e.target.checked })
                    }
                    color="success"
                  />
                }
                label={t("inAppLabel")}
                sx={{ display: "flex", minHeight: 44, ml: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={pref.pushEnabled}
                    disabled={saving === pref.typeKey || !pushSupport.supported}
                    onChange={(e) => void updatePreference(pref.typeKey, { pushEnabled: e.target.checked })}
                    color="success"
                  />
                }
                label={t("pushLabel")}
                sx={{ display: "flex", minHeight: 44, ml: 0 }}
              />
            </Paper>
          ))}
        </Box>
      )}
    </main>
  );
}
