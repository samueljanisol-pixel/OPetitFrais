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
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import PhoneAndroidOutlinedIcon from "@mui/icons-material/PhoneAndroidOutlined";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getDevicePushState,
  pushStatusMessageKey,
  type DevicePushState,
} from "@/lib/notifications/usePushNotifications";
import type { NotificationTypeKey } from "@/lib/notifications/types";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type PreferenceItem = {
  typeKey: NotificationTypeKey;
  permission: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
};

type SavingTarget = "bell" | "push" | NotificationTypeKey | null;

function isEventEnabled(pref: PreferenceItem): boolean {
  return pref.inAppEnabled && pref.pushEnabled;
}

export default function NotificationPreferencesClient() {
  const t = useTranslations("backoffice.notifications");
  const tCommon = useTranslations("common");
  const BackChevron = useBackChevronIcon();
  const { loading: sessionLoading, can } = useSessionPermissions();
  const [preferences, setPreferences] = useState<PreferenceItem[]>([]);
  const [globalInAppEnabled, setGlobalInAppEnabled] = useState(true);
  const [globalPushPrefEnabled, setGlobalPushPrefEnabled] = useState(false);
  const [devicePush, setDevicePush] = useState<DevicePushState | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SavingTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const refreshDevicePush = useCallback(async () => {
    const state = await getDevicePushState();
    setDevicePush(state);
    return state;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefRes] = await Promise.all([
        fetch("/api/notifications/preferences", { credentials: "include" }),
        refreshDevicePush(),
      ]);
      const json = (await prefRes.json()) as {
        preferences: PreferenceItem[];
        globalInAppEnabled?: boolean;
        globalPushEnabled?: boolean;
        pushConfigured: boolean;
        vapidPublicKey: string | null;
        error?: string;
      };
      if (!prefRes.ok) {
        setError(json.error ?? tCommon("error"));
        return;
      }
      setPreferences(json.preferences ?? []);
      setGlobalInAppEnabled(json.globalInAppEnabled ?? true);
      setGlobalPushPrefEnabled(json.globalPushEnabled ?? false);
      setPushConfigured(json.pushConfigured ?? false);
      setVapidPublicKey(json.vapidPublicKey);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }, [refreshDevicePush, tCommon]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchGlobal = useCallback(
    async (patch: { inAppEnabled?: boolean; pushEnabled?: boolean }) => {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global: true, ...patch }),
      });
      const json = (await res.json()) as {
        error?: string;
        preferences?: PreferenceItem[];
        globalInAppEnabled?: boolean;
        globalPushEnabled?: boolean;
      };
      if (!res.ok) {
        throw new Error(json.error ?? tCommon("error"));
      }
      if (json.preferences) {
        setPreferences(json.preferences);
      }
      if (json.globalInAppEnabled !== undefined) setGlobalInAppEnabled(json.globalInAppEnabled);
      if (json.globalPushEnabled !== undefined) setGlobalPushPrefEnabled(json.globalPushEnabled);
    },
    [tCommon],
  );

  const patchEvent = useCallback(
    async (typeKey: NotificationTypeKey, enabled: boolean) => {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeKey,
          inAppEnabled: enabled,
          pushEnabled: enabled,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        preferences?: PreferenceItem[];
        globalInAppEnabled?: boolean;
        globalPushEnabled?: boolean;
      };
      if (!res.ok) {
        throw new Error(json.error ?? tCommon("error"));
      }
      const updated = json.preferences?.find((p) => p.typeKey === typeKey);
      if (json.preferences) {
        setPreferences(json.preferences);
      } else if (updated) {
        setPreferences((prev) => prev.map((p) => (p.typeKey === typeKey ? updated : p)));
      }
      if (json.globalInAppEnabled !== undefined) setGlobalInAppEnabled(json.globalInAppEnabled);
      if (json.globalPushEnabled !== undefined) setGlobalPushPrefEnabled(json.globalPushEnabled);
    },
    [tCommon],
  );

  const mapPushError = useCallback(
    (code: string) => {
      if (code === "ios_requires_install") return t("iosInstallHint");
      if (code === "denied") return t("pushDenied");
      if (code === "unsupported") return t("pushUnsupported");
      if (code === "insecure_context") return t("pushInsecureContext");
      if (code === "push_service_unavailable") return t("pushServiceUnavailable");
      return t("pushSubscribeError");
    },
    [t],
  );

  const onToggleBell = useCallback(
    async (enabled: boolean) => {
      setSaving("bell");
      setError(null);
      try {
        await patchGlobal({ inAppEnabled: enabled });
      } catch (e) {
        setError(e instanceof Error ? e.message : tCommon("error"));
      } finally {
        setSaving(null);
      }
    },
    [patchGlobal, tCommon],
  );

  const onTogglePush = useCallback(
    async (enabled: boolean) => {
      setSaving("push");
      setPushMessage(null);
      setError(null);

      try {
        if (enabled) {
          if (!pushConfigured || !vapidPublicKey) {
            setPushMessage(t("pushNotConfigured"));
            return;
          }
          const sub = await subscribeToPush(vapidPublicKey);
          if (!sub.ok) {
            setPushMessage(mapPushError(sub.error));
            await refreshDevicePush();
            return;
          }
        } else {
          await unsubscribeFromPush();
        }
        await refreshDevicePush();
      } catch (e) {
        setError(e instanceof Error ? e.message : tCommon("error"));
      } finally {
        setSaving(null);
      }
    },
    [mapPushError, pushConfigured, refreshDevicePush, t, tCommon, vapidPublicKey],
  );

  const onToggleEvent = useCallback(
    async (typeKey: NotificationTypeKey, enabled: boolean) => {
      setSaving(typeKey);
      setError(null);
      try {
        await patchEvent(typeKey, enabled);
      } catch (e) {
        setError(e instanceof Error ? e.message : tCommon("error"));
      } finally {
        setSaving(null);
      }
    },
    [patchEvent, tCommon],
  );

  if (sessionLoading || loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-6">
        <CircularProgress color="success" />
      </main>
    );
  }

  const hasAccess = can("commandes_fournisseur.consolidation");
  const pushActiveOnDevice = devicePush?.activeOnDevice ?? false;
  const pushStatusKey = devicePush ? pushStatusMessageKey(devicePush) : null;
  const pushToggleDisabled =
    saving === "push" ||
    !devicePush?.support.supported ||
    devicePush?.permission === "denied";

  const hasPushOnAnotherDevice =
    globalPushPrefEnabled && !pushActiveOnDevice && (devicePush?.support.supported ?? false);

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

      {!hasAccess || preferences.length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, border: 1, borderColor: "divider", borderRadius: 2 }}>
          <Typography color="text.secondary">{t("noTypesAvailable")}</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <NotificationsOutlinedIcon color="success" fontSize="small" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {t("bellLabel")}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t("bellDescription")}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={globalInAppEnabled}
                  disabled={saving === "bell"}
                  onChange={(e) => void onToggleBell(e.target.checked)}
                  color="success"
                />
              }
              label={globalInAppEnabled ? t("enabled") : t("disabled")}
              sx={{ display: "flex", minHeight: 44, ml: 0 }}
            />
          </Paper>

          <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <PhoneAndroidOutlinedIcon color="success" fontSize="small" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {t("pushLabel")}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("pushDescription")}
            </Typography>
            {pushStatusKey ? (
              <Typography
                variant="caption"
                color={pushActiveOnDevice ? "success.main" : "text.secondary"}
                sx={{ display: "block", mb: 1.5 }}
              >
                {t(pushStatusKey)}
              </Typography>
            ) : null}
            <FormControlLabel
              control={
                <Switch
                  checked={pushActiveOnDevice}
                  disabled={pushToggleDisabled}
                  onChange={(e) => void onTogglePush(e.target.checked)}
                  color="success"
                />
              }
              label={pushActiveOnDevice ? t("enabledOnDevice") : t("disabledOnDevice")}
              sx={{ display: "flex", minHeight: 44, ml: 0 }}
            />
            {hasPushOnAnotherDevice ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                {t("pushEnabledElsewhereHint")}
              </Typography>
            ) : null}
          </Paper>

          <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
              {t("typesSectionTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t("typesSectionHint")}
            </Typography>
            {preferences.map((pref, index) => {
              const enabled = isEventEnabled(pref);
              const eventSaving = saving === pref.typeKey;
              return (
                <Box
                  key={pref.typeKey}
                  sx={{
                    pt: index > 0 ? 1.5 : 0,
                    mt: index > 0 ? 1.5 : 0,
                    borderTop: index > 0 ? 1 : 0,
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {t(`types.${pref.typeKey}.label`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    {t(`types.${pref.typeKey}.description`)}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={enabled}
                        disabled={eventSaving || saving === "bell" || saving === "push"}
                        onChange={(e) => void onToggleEvent(pref.typeKey, e.target.checked)}
                        color="success"
                      />
                    }
                    label={enabled ? t("eventEnabled") : t("eventDisabled")}
                    sx={{ display: "flex", minHeight: 44, ml: 0 }}
                  />
                  {enabled && !globalInAppEnabled ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {t("eventClocheOffHint")}
                    </Typography>
                  ) : null}
                  {enabled && !pushActiveOnDevice ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {t("eventPushOffHint")}
                    </Typography>
                  ) : null}
                </Box>
              );
            })}
          </Paper>
        </Box>
      )}
    </main>
  );
}
