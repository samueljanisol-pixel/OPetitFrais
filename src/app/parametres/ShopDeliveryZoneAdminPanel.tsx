"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { isValidDeliveryGeoJson, latLngsFromGeoJson, polygonFromLatLngs } from "@/lib/shop/point-in-polygon";

const AdminZoneDrawMap = dynamic(() => import("@/app/parametres/AdminZoneDrawMap"), {
  ssr: false,
});

type MagasinOption = { id: string; code: string; nom: string };

export default function ShopDeliveryZoneAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [label, setLabel] = useState("Zone de livraison");
  const [points, setPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [contactPhone, setContactPhone] = useState("");
  const [pickupMagasinId, setPickupMagasinId] = useState("");
  const [magasins, setMagasins] = useState<MagasinOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/shop-delivery-zone", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        zone?: { label?: string; geojson?: unknown } | null;
        contactPhone?: string;
        pickupMagasinId?: string;
        magasins?: MagasinOption[];
      };
      if (!res.ok) throw new Error(j.error ?? "Chargement impossible");
      setMagasins(j.magasins ?? []);
      setContactPhone(j.contactPhone ?? "");
      setPickupMagasinId(j.pickupMagasinId ?? "");
      if (j.zone?.label) setLabel(j.zone.label);
      if (j.zone?.geojson && isValidDeliveryGeoJson(j.zone.geojson)) {
        setPoints(latLngsFromGeoJson(j.zone.geojson));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const geojson = polygonFromLatLngs(points);
      if (!geojson) {
        throw new Error("Tracez au moins 3 points sur la carte pour la zone");
      }
      const res = await fetch("/api/admin/shop-delivery-zone", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          geojson,
          contactPhone,
          pickupMagasinId: pickupMagasinId || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Enregistrement impossible");
      setOkMsg("Enregistré");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Typography className="!text-slate-600">Chargement…</Typography>;
  }

  return (
    <Box className="flex flex-col gap-4">
      <Typography variant="body2" className="!text-slate-600">
        Dessinez la zone de livraison en cliquant sur la carte (polygone). Choisissez le magasin de
        retrait boutique et le numéro de contact affiché sur le site.
      </Typography>
      {err ? (
        <Typography color="error" variant="body2">
          {err}
        </Typography>
      ) : null}
      {okMsg ? (
        <Typography color="success.main" variant="body2">
          {okMsg}
        </Typography>
      ) : null}
      <TextField
        label="Libellé zone"
        size="small"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        fullWidth
      />
      <TextField
        label="Numéro boutique (WhatsApp / appel, ex. 2126…)"
        size="small"
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
        fullWidth
        helperText="Sans + ; international. Vide = masqué sur le site."
      />
      <FormControl size="small" fullWidth>
        <InputLabel id="pickup-magasin-label">Magasin retrait boutique</InputLabel>
        <Select
          labelId="pickup-magasin-label"
          label="Magasin retrait boutique"
          value={pickupMagasinId}
          onChange={(e) => setPickupMagasinId(String(e.target.value))}
        >
          <MenuItem value="">
            <em>Aucun</em>
          </MenuItem>
          {magasins.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.nom} ({m.code})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <AdminZoneDrawMap points={points} onChange={setPoints} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          onClick={() => setPoints((p) => p.slice(0, -1))}
          disabled={points.length === 0 || saving}
          sx={{ textTransform: "none" }}
        >
          Annuler le dernier point
        </Button>
        <Button
          variant="outlined"
          color="warning"
          onClick={() => setPoints([])}
          disabled={points.length === 0 || saving}
          sx={{ textTransform: "none" }}
        >
          Effacer la zone
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => void save()}
          disabled={saving}
          sx={{ textTransform: "none" }}
        >
          {saving ? "…" : "Enregistrer"}
        </Button>
      </div>
      <Typography variant="caption" className="!text-slate-500">
        {points.length} point{points.length === 1 ? "" : "s"} — minimum 3 pour un polygone.
      </Typography>
    </Box>
  );
}
