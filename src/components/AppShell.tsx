"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import NotificationBell from "@/components/NotificationBell";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, displayName } = useSessionPermissions();
  const t = useTranslations("backoffice.shell");

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-emerald-100/80 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-sm"
        role="banner"
        aria-label={loading ? t("profile") : t("profileWithName", { name: displayName })}
      >
        <Link
          href="/"
          title={t("homeTitle")}
          aria-label={t("homeAria")}
          className="relative block h-11 w-[9.5rem] shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-emerald-100 transition hover:ring-emerald-200"
        >
          <Image
            src="/logo-opetitfrais.png"
            alt=""
            fill
            className="object-contain p-0.5"
            sizes="152px"
            priority
          />
        </Link>

        <div className="ms-auto flex min-w-0 max-w-[min(100%,24rem)] shrink-0 items-center gap-1">
          <NotificationBell />
          <LocaleSwitcher variant="header" />
          <AccountCircleOutlinedIcon className="!h-7 !w-7 shrink-0 text-emerald-700" aria-hidden />
          <span className="min-w-0 truncate text-sm font-medium text-slate-800" title={displayName}>
            {loading ? t("loading") : displayName || "—"}
          </span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
