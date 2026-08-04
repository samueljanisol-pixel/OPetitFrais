"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { Badge, Box, IconButton } from "@mui/material";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { formatShopPriceDh } from "@/lib/shop/format-price";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { useShopRoutes } from "@/lib/shop/useShopRoutes";

type Props = {
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
  children: React.ReactNode;
  hideCart?: boolean;
};

export default function ShopShell({
  cartCount,
  cartTotal,
  onOpenCart,
  children,
  hideCart = false,
}: Props) {
  const t = useTranslations("shop");
  const locale = useAppLocale();
  const routes = useShopRoutes();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-emerald-100/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm"
        role="banner"
      >
        <Link
          href={routes.home}
          title={t("homeTitle")}
          aria-label={t("homeTitle")}
          className="relative block h-10 w-[8.5rem] shrink-0 overflow-hidden rounded-lg bg-white"
        >
          <Image
            src="/logo-opetitfrais.png"
            alt={t("logoAlt")}
            fill
            className="object-contain p-0.5"
            sizes="136px"
            priority
          />
        </Link>

        <Box sx={{ ms: "auto", display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
          <LocaleSwitcher variant="login" />
          {!hideCart ? (
          <Box sx={{ ml: 0.5, display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
            <IconButton
              color="success"
              size="small"
              aria-label={t("openCart")}
              onClick={onOpenCart}
              sx={{ flexShrink: 0 }}
            >
              <Badge
                badgeContent={cartCount > 0 ? cartCount : null}
                color="error"
                sx={{
                  "& .MuiBadge-badge": {
                    minWidth: 16,
                    height: 16,
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    px: 0.375,
                  },
                }}
              >
                <ShoppingCartOutlinedIcon fontSize="small" />
              </Badge>
            </IconButton>
            {cartCount > 0 ? (
              <Box
                component="button"
                type="button"
                onClick={onOpenCart}
                aria-label={t("cartSummary", {
                  count: cartCount,
                  total: formatShopPriceDh(locale, cartTotal, true),
                })}
                sx={{
                  fontWeight: 700,
                  color: "success.dark",
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  border: "none",
                  bgcolor: "transparent",
                  cursor: "pointer",
                  p: 0,
                  flexShrink: 0,
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {formatShopPriceDh(locale, cartTotal, true)}
              </Box>
            ) : null}
          </Box>
          ) : null}
        </Box>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
