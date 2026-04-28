"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, displayName } = useSessionPermissions();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-emerald-100/80 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-sm"
        role="banner"
        aria-label={loading ? "Profil" : `Profil : ${displayName}`}
      >
        <Link
          href="/"
          title="O' Petit Frais — accueil"
          aria-label="O' Petit Frais — accueil"
          className="relative block h-11 w-[9.5rem] shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-emerald-100 transition hover:ring-emerald-200"
        >
          <Image
            src="/logo-opetitfrais.png"
            alt="O' Petit Frais"
            fill
            className="object-contain p-0"
            sizes="152px"
            priority
          />
        </Link>

        <div className="ml-auto flex min-w-0 max-w-[min(100%,20rem)] shrink-0 items-center gap-2">
          <AccountCircleOutlinedIcon className="!h-7 !w-7 shrink-0 text-emerald-700" aria-hidden />
          <span className="min-w-0 truncate text-sm font-medium text-slate-800" title={displayName}>
            {loading ? "Chargement…" : displayName || "—"}
          </span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
