"use client";

import { useMemo } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { prefixer } from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { NextIntlClientProvider } from "next-intl";
import { isRtl, type AppLocale } from "@/i18n/config";

type AppProvidersProps = {
  locale: AppLocale;
  messages: Record<string, unknown>;
  timeZone: string;
  children: React.ReactNode;
};

export default function AppProviders({ locale, messages, timeZone, children }: AppProvidersProps) {
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

  if (rtl) {
    return (
      <AppRouterCacheProvider options={{ enableCssLayer: true }}>
        <CacheProvider value={rtlCache}>{content}</CacheProvider>
      </AppRouterCacheProvider>
    );
  }

  return <AppRouterCacheProvider options={{ enableCssLayer: true }}>{content}</AppRouterCacheProvider>;
}
