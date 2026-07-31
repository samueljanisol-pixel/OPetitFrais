"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import NotificationBell from "@/components/NotificationBell";
import { isShopLocalPreviewPath } from "@/lib/shop/hosts";

type AppShellProps = {
  children: React.ReactNode;
  shopMode?: boolean;
};

/** Logo 400×150 → hauteur 44px ≈ largeur 117px (+ petite marge). */
const LOGO_LINK_CLASS =
  "relative block h-11 w-[7.5rem] shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-emerald-100 transition hover:ring-emerald-200";

export default function AppShell({ children, shopMode = false }: AppShellProps) {
  const pathname = usePathname();
  const { loading, displayName } = useSessionPermissions();
  const t = useTranslations("backoffice.shell");
  const nameLabel = loading ? t("loading") : displayName || "—";

  if (pathname === "/login" || shopMode || (pathname != null && isShopLocalPreviewPath(pathname))) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-hidden">
      <header
        className="sticky top-0 z-30 flex w-full min-w-0 shrink-0 items-center gap-1.5 overflow-x-hidden border-b border-emerald-100/80 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-sm sm:gap-2"
        role="banner"
        aria-label={loading ? t("profile") : t("profileWithName", { name: displayName })}
      >
        <Link href="/" title={t("homeTitle")} aria-label={t("homeAria")} className={LOGO_LINK_CLASS}>
          <Image
            src="/logo-opetitfrais.png"
            alt=""
            fill
            className="object-contain p-0.5"
            sizes="120px"
            priority
          />
        </Link>

        <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-hidden sm:gap-1">
          <NotificationBell />
          <LocaleSwitcher variant="header" />
          <div className="flex min-w-0 max-w-[4.75rem] shrink flex-col items-center justify-center sm:max-w-[6.5rem]">
            <AccountCircleOutlinedIcon className="!h-7 !w-7 shrink-0 text-emerald-700" aria-hidden />
            <span
              className="mt-0.5 w-full truncate text-center text-[0.65rem] font-medium leading-tight text-slate-800"
              title={nameLabel}
            >
              {nameLabel}
            </span>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
