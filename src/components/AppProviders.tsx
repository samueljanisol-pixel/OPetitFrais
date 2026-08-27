"use client";

import { useMemo } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { prefixer } from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { NextIntlClientProvider } from "next-intl";
import { isRtl } from "@/i18n/config";
import { useLocaleClient } from "@/lib/i18n/locale-client";
import { SessionProvider } from "@/lib/auth/SessionProvider";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const { locale, messages, timeZone } = useLocaleClient();
  const rtl = isRtl(locale);

  const theme = useMemo(
    () =>
      createTheme({
        direction: rtl ? "rtl" : "ltr",
      }),
    [rtl],
  );

  const rtlCache = useMemo(
    () =>
      createCache({
        key: rtl ? "muirtl" : "mui",
        stylisPlugins: rtl ? [prefixer, rtlPlugin] : [prefixer],
      }),
    [rtl],
  );

  const content = (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </NextIntlClientProvider>
  );

  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      {/* SessionProvider hors branche RTL : éviter un remount (perte / course sur la session) au basculement de langue. */}
      <SessionProvider>
        {rtl ? <CacheProvider value={rtlCache}>{content}</CacheProvider> : content}
      </SessionProvider>
    </AppRouterCacheProvider>
  );
}
