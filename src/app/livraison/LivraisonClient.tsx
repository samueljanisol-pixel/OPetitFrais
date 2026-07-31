"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import PhoneIcon from "@mui/icons-material/Phone";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { Alert, Box, Button, Typography } from "@mui/material";
import ShopShell from "@/app/shop/ShopShell";
import ShopLivraisonMapDynamic from "@/lib/shop/map/ShopLivraisonMapDynamic";
import { pointInDeliveryZone } from "@/lib/shop/point-in-polygon";
import { buildWhatsAppUrl } from "@/lib/shop/format-order-text";
import type { ShopLivraisonPayload } from "@/lib/shop/livraison-types";
import { useShopRoutes } from "@/lib/shop/useShopRoutes";

type CheckResult = "inside" | "outside" | null;

type Props = {
  initial: ShopLivraisonPayload;
};

export default function LivraisonClient({ initial }: Props) {
  const t = useTranslations("shop");
  const routes = useShopRoutes();
  const [payload] = useState(initial);
  const [userPoint, setUserPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [check, setCheck] = useState<CheckResult>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const evaluate = useCallback(
    (lat: number, lng: number) => {
      setUserPoint({ lat, lng });
      if (!payload.zone) {
        setCheck(null);
        return;
      }
      setCheck(pointInDeliveryZone(lat, lng, payload.zone.geojson) ? "inside" : "outside");
    },
    [payload.zone],
  );

  const requestGeo = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t("livraison.geoUnsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        evaluate(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setGeoError(t("livraison.geoDenied"));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const contactPhone = payload.contactPhone;
  const telHref = contactPhone ? `tel:+${contactPhone}` : null;
  const waHref = contactPhone
    ? buildWhatsAppUrl(contactPhone, t("livraison.whatsappPrefill"))
    : null;

  const mapMagasins = useMemo(() => {
    const list = [...payload.magasins];
    if (payload.pickupMagasin && !list.some((m) => m.id === payload.pickupMagasin!.id)) {
      list.unshift(payload.pickupMagasin);
    }
    return list;
  }, [payload.magasins, payload.pickupMagasin]);

  return (
    <ShopShell cartCount={0} cartTotal={0} onOpenCart={() => undefined} hideCart>
      <main className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-emerald-50/80 to-white pb-10">
        <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Typography variant="h5" color="success.dark" sx={{ fontWeight: 800 }}>
            {t("livraison.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("livraison.subtitle")}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <Link href={routes.home} className="font-semibold text-emerald-700 underline">
              {t("livraison.backCatalog")}
            </Link>
          </Typography>
        </Box>

        <Box sx={{ px: 2, pb: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
            <Button
              variant="contained"
              color="success"
              startIcon={<MyLocationIcon />}
              onClick={requestGeo}
              sx={{ textTransform: "none", fontWeight: 700, alignSelf: "flex-start" }}
            >
              {t("livraison.checkPosition")}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {t("livraison.clickMapHint")}
            </Typography>
            {geoError ? (
              <Alert severity="warning" sx={{ py: 0 }}>
                {geoError}
              </Alert>
            ) : null}
            {check === "inside" ? (
              <Alert severity="success">{t("livraison.inside")}</Alert>
            ) : null}
            {check === "outside" ? (
              <Alert severity="error">{t("livraison.outside")}</Alert>
            ) : null}
          </Box>

        <Box sx={{ px: 2 }}>
          <ShopLivraisonMapDynamic
            zone={payload.zone?.geojson ?? null}
            magasins={mapMagasins}
            userPoint={userPoint}
            onMapClick={(lat, lng) => evaluate(lat, lng)}
            height={380}
          />
        </Box>

        {payload.pickupMagasin ? (
          <Box sx={{ px: 2, pt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t("livraison.pickupStore")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {payload.pickupMagasin.nom}
              {payload.pickupMagasin.adresse
                ? ` — ${payload.pickupMagasin.adresse}${
                    payload.pickupMagasin.ville ? `, ${payload.pickupMagasin.ville}` : ""
                  }`
                : ""}
            </Typography>
            {payload.pickupMagasin.google_maps_url ? (
              <Button
                href={payload.pickupMagasin.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                sx={{ textTransform: "none", mt: 0.5, px: 0 }}
              >
                {t("livraison.openMaps")}
              </Button>
            ) : null}
          </Box>
        ) : null}

        {payload.magasins.length > 0 ? (
          <Box sx={{ px: 2, pt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              {t("livraison.stores")}
            </Typography>
            <ul className="space-y-2">
              {payload.magasins.map((m) => (
                <li key={m.id} className="rounded-lg border border-emerald-100 bg-white/80 p-3 text-sm">
                  <div className="font-semibold text-slate-900">{m.nom}</div>
                  {m.adresse || m.ville ? (
                    <div className="text-slate-600">
                      {[m.adresse, m.ville].filter(Boolean).join(", ")}
                    </div>
                  ) : null}
                  {m.google_maps_url ? (
                    <a
                      href={m.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-medium text-emerald-700 underline"
                    >
                      {t("livraison.openMaps")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </Box>
        ) : null}

        {contactPhone ? (
          <Box
            sx={{
              px: 2,
              pt: 3,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t("livraison.contactTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("livraison.contactHint")}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {telHref ? (
                <Button
                  variant="outlined"
                  color="success"
                  href={telHref}
                  startIcon={<PhoneIcon />}
                  sx={{ textTransform: "none", fontWeight: 700 }}
                >
                  {t("livraison.call")}
                </Button>
              ) : null}
              {waHref ? (
                <Button
                  variant="contained"
                  color="success"
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  startIcon={<WhatsAppIcon />}
                  sx={{ textTransform: "none", fontWeight: 700 }}
                >
                  {t("livraison.whatsapp")}
                </Button>
              ) : null}
            </Box>
          </Box>
        ) : null}
      </main>
    </ShopShell>
  );
}
