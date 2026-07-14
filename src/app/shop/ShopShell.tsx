"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { Badge, Box, IconButton } from "@mui/material";
import LocaleSwitcher from "@/components/LocaleSwitcher";

type Props = {
  cartCount: number;
  onOpenCart: () => void;
  children: React.ReactNode;
};

export default function ShopShell({ cartCount, onOpenCart, children }: Props) {
  const t = useTranslations("shop");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-emerald-100/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm"
        role="banner"
      >
        <Link
          href="/"
          title={t("homeTitle")}
          aria-label={t("homeTitle")}
          className="relative block h-10 w-[8.5rem] shrink-0 overflow-hidden rounded-lg bg-white"
        >
          <Image
            src="/logo-opetitfrais.png"
            alt=""
            fill
            className="object-contain p-0.5"
            sizes="136px"
            priority
          />
        </Link>

        <Box sx={{ ms: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
          <LocaleSwitcher variant="login" />
          <IconButton
            color="success"
            aria-label={t("openCart")}
            onClick={onOpenCart}
            sx={{ ml: 0.5 }}
          >
            <Badge badgeContent={cartCount > 0 ? cartCount : null} color="error">
              <ShoppingCartOutlinedIcon />
            </Badge>
          </IconButton>
        </Box>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
