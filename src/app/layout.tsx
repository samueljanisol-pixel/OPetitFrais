import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notoSansArabic } from "@/lib/fonts/noto-sans-arabic";
import { headers } from "next/headers";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import "./globals.css";
import SwRegister from "./swRegister";
import AppShell from "@/components/AppShell";
import AppProviders from "@/components/AppProviders";
import { LocaleClientProvider } from "@/lib/i18n/locale-client";
import { isRtl, normalizeLocale, type AppLocale } from "@/i18n/config";
import { isShopHost } from "@/lib/shop/hosts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opetitfrais.ma"),
  title: "O' Petit Frais",
  description:
    "O' Petit Frais — Fruits et légumes frais à Dar Bouazza - Casablanca. Qualité et fraîcheur au quotidien.",
  manifest: "/manifest.webmanifest",
  applicationName: "O' Petit Frais",
  appleWebApp: {
    capable: true,
    title: "O' Petit Frais",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png" }, { url: "/icons/icon-512.png" }],
    apple: [{ url: "/icons/icon-512.png" }],
  },
};

export const viewport = {
  themeColor: "#16a34a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeLocale(await getLocale()) as AppLocale;
  const messages = await getMessages();
  const timeZone = await getTimeZone();
  const dir = isRtl(locale) ? "rtl" : "ltr";
  const host = (await headers()).get("host");
  const shopMode = isShopHost(host);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansArabic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <LocaleClientProvider
          initialLocale={locale}
          initialMessages={messages as Record<string, unknown>}
          timeZone={timeZone}
        >
          <AppProviders>
            <SwRegister />
            <AppShell shopMode={shopMode}>{children}</AppShell>
          </AppProviders>
        </LocaleClientProvider>
      </body>
    </html>
  );
}
