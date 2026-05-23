"use client";

import { FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useMagasinSaisie } from "./MagasinSaisieContext";

type Props = { className?: string };

export default function SaisieMagasinStrip({ className }: Props) {
  const { loading, canCommandesFournisseurSaisie } = useSessionPermissions();
  const { magasins, currentMagasin, setMagasinId } = useMagasinSaisie();
  const t = useTranslations("backoffice.commandes.saisie.magasinStrip");

  if (loading || !canCommandesFournisseurSaisie || magasins.length === 0) {
    return null;
  }

  return (
    <div className={`border-b border-emerald-100/90 bg-emerald-50/50 px-4 py-2 ${className ?? ""}`}>
      <div className="flex flex-row flex-wrap items-center justify-start gap-4">
        {magasins.length === 1 ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("activeStoreValue", { name: currentMagasin?.nom ?? currentMagasin?.code ?? "" })}
          </Typography>
        ) : (
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="magasin-actif-label">{t("activeStore")}</InputLabel>
            <Select
              labelId="magasin-actif-label"
              label={t("activeStore")}
              value={currentMagasin?.id ?? ""}
              onChange={(e) => setMagasinId(e.target.value)}
            >
              {magasins.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.nom.trim() || m.code}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </div>
    </div>
  );
}
