"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { Badge, Box, IconButton, Typography } from "@mui/material";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { formatShopPriceDh } from "@/lib/shop/format-price";
import { useAppLocale } from "@/lib/i18n/useAppFormat";

type Props = {
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
  children: React.ReactNode;
};

export default function ShopShell({ cartCount, cartTotal, onOpenCart, children }: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();

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
          <Box sx={{ ml: 0.5, display: "flex", alignItems: "center", gap: 0.75 }}>
            <IconButton color="success" size="small" aria-label={t("openCart")} onClick={onOpenCart}>
              <Badge badgeContent={cartCount > 0 ? cartCount : null} color="error">
                <ShoppingCartOutlinedIcon fontSize="small" />
              </Badge>
            </IconButton>
            {cartCount > 0 ? (
              <Typography
                component="button"
                type="button"
                variant="caption"
                onClick={onOpenCart}
                sx={{
                  fontWeight: 700,
                  color: "success.dark",
                  whiteSpace: "nowrap",
                  fontSize: "0.75rem",
                  border: "none",
                  bgcolor: "transparent",
                  cursor: "pointer",
                  p: 0,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {t("cartSummary", { count: cartCount, total: formatShopPriceDh(locale, cartTotal) })}
              </Typography>
            ) : null}
          </Box>
        </Box>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
