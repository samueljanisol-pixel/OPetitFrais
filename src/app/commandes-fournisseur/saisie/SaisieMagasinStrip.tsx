"use client";

import { FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useMagasinSaisie } from "./MagasinSaisieContext";

type Props = { className?: string };

export default function SaisieMagasinStrip({ className }: Props) {
  const { loading, canCommandesFournisseurSaisie, displayName } = useSessionPermissions();
  const { magasins, currentMagasin, setMagasinId } = useMagasinSaisie();

  if (loading || !canCommandesFournisseurSaisie || magasins.length === 0) {
    return null;
  }

  return (
    <div className={`border-b border-emerald-100/90 bg-emerald-50/50 px-4 py-2 ${className ?? ""}`}>
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <Typography variant="body2" color="text.secondary">
          {displayName}
        </Typography>
        {magasins.length === 1 ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Magasin actif : {currentMagasin?.nom ?? currentMagasin?.code}
          </Typography>
        ) : (
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="magasin-actif-label">Magasin actif</InputLabel>
            <Select
              labelId="magasin-actif-label"
              label="Magasin actif"
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
