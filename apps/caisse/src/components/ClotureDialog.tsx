import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { CaisseClotureRecord, CaisseSessionPublic } from "../../electron/preload/index";
import RoundNumpad from "./RoundNumpad";

const COUNT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"] as const;

type FieldKey = "bills50" | "bills20" | "coins10";

type Props = {
  open: boolean;
  session: CaisseSessionPublic;
  onClose: () => void;
  onClosed: (cloture: CaisseClotureRecord) => void;
};

function parseCount(raw: string): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ClotureDialog({ open, session, onClose, onClosed }: Props) {
  const [cardCount, setCardCount] = useState(session.cardTicketCount);
  const [active, setActive] = useState<FieldKey>("bills50");
  const [values, setValues] = useState<Record<FieldKey, string>>({
    bills50: "",
    bills20: "",
    coins10: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({ bills50: "", bills20: "", coins10: "" });
    setActive("bills50");
    setError(null);
    setBusy(false);
    void window.caisseApi?.getSession().then((s) => {
      setCardCount(s.cardTicketCount);
    });
  }, [open]);

  const bills50 = parseCount(values.bills50);
  const bills20 = parseCount(values.bills20);
  const coins10 = parseCount(values.coins10);
  const drawerTotal = bills50 * 50 + bills20 * 20 + coins10 * 10;

  const handleKey = (key: string) => {
    setError(null);
    setValues((prev) => {
      const cur = prev[active];
      if (key === "C") return { ...prev, [active]: "" };
      if (key === "←") return { ...prev, [active]: cur.slice(0, -1) };
      if (/^\d$/.test(key) && cur.length < 4) return { ...prev, [active]: cur + key };
      return prev;
    });
  };

  const confirm = async () => {
    if (busy || !window.caisseApi?.closeSession) return;
    setBusy(true);
    setError(null);
    const result = await window.caisseApi.closeSession({ bills50, bills20, coins10 });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClosed(result.cloture);
  };

  const fieldBtn = (key: FieldKey, label: string, count: number) => (
    <Button
      key={key}
      fullWidth
      variant={active === key ? "contained" : "outlined"}
      onClick={() => setActive(key)}
      sx={{ justifyContent: "space-between", py: 1.35, fontWeight: 700 }}
    >
      <span>{label}</span>
      <span>{count}</span>
    </Button>
  );

  return (
    <Dialog open={open} onClose={() => undefined} disableEscapeKeyDown maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Clôturer la caisse</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.25, pb: 2 }}>
        <Typography variant="body2">
          Caissier : <strong>{session.caissierName ?? "—"}</strong>
        </Typography>
        <Typography variant="body2">
          Tickets carte bancaire : <strong>{cardCount}</strong>
        </Typography>
        {fieldBtn("bills50", "Billets de 50", bills50)}
        {fieldBtn("bills20", "Billets de 20", bills20)}
        {fieldBtn("coins10", "Pièces de 10", coins10)}
        <Typography sx={{ fontWeight: 800 }}>
          Total laissé en caisse : {drawerTotal} DH
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <RoundNumpad keys={COUNT_KEYS} onKey={handleKey} keySize={52} disabled={busy} />
        </Box>
        {error ? (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        ) : null}
        <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
          <Button fullWidth disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button fullWidth variant="contained" color="error" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Clôture…" : "Valider la clôture"}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
