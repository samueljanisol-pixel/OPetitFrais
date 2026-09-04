import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { CaisseClotureRecord, CaisseSessionPublic } from "../../electron/preload/index";
import { cashDenomination } from "../lib/payment-monnaie";
import RoundNumpad from "./RoundNumpad";

const COUNT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"] as const;

type FieldKey = "bills50" | "bills20" | "coins10";

const FIELDS: Array<{ key: FieldKey; label: string; amount: number }> = [
  { key: "bills50", label: "Billets de 50", amount: 50 },
  { key: "bills20", label: "Billets de 20", amount: 20 },
  { key: "coins10", label: "Pièces de 10", amount: 10 },
];

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
  const [saleCount, setSaleCount] = useState(session.saleCount);
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
      setSaleCount(s.saleCount);
      setCardCount(s.cardTicketCount);
    });
  }, [open]);

  const counts: Record<FieldKey, number> = {
    bills50: parseCount(values.bills50),
    bills20: parseCount(values.bills20),
    coins10: parseCount(values.coins10),
  };
  const drawerTotal = counts.bills50 * 50 + counts.bills20 * 20 + counts.coins10 * 10;

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
    const result = await window.caisseApi.closeSession({
      bills50: counts.bills50,
      bills20: counts.bills20,
      coins10: counts.coins10,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClosed(result.cloture);
  };

  return (
    <Dialog open={open} onClose={() => undefined} disableEscapeKeyDown maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Clôturer la caisse</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.25, pb: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          <Typography variant="body2">
            Caissier : <strong>{session.caissierName ?? "—"}</strong>
          </Typography>
          <Typography variant="body2">
            Ventes : <strong>{saleCount}</strong>
          </Typography>
          <Typography variant="body2">
            Tickets CB : <strong>{cardCount}</strong>
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "stretch",
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 1 }}>
            {FIELDS.map(({ key, label, amount }) => {
              const denom = cashDenomination(amount);
              const selected = active === key;
              const count = counts[key];
              return (
                <Button
                  key={key}
                  fullWidth
                  variant="outlined"
                  onClick={() => setActive(key)}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    py: 0.75,
                    px: 1.25,
                    gap: 1.25,
                    fontWeight: 700,
                    borderWidth: 2,
                    borderColor: selected ? "primary.main" : "divider",
                    bgcolor: selected ? "action.selected" : "#fff",
                    color: "text.primary",
                    "&:hover": {
                      borderWidth: 2,
                      borderColor: "primary.main",
                      bgcolor: selected ? "action.selected" : "#fafafa",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
                    {denom ? (
                      <Box
                        component="img"
                        src={denom.image}
                        alt={label}
                        sx={{
                          height: 48,
                          width: denom.kind === "coin" ? 48 : 88,
                          objectFit: "contain",
                          flexShrink: 0,
                          borderRadius: 0.5,
                          bgcolor: "#fff",
                        }}
                      />
                    ) : null}
                    <span>{label}</span>
                  </Box>
                  <Typography component="span" sx={{ fontSize: 22, fontWeight: 800, minWidth: 36, textAlign: "right" }}>
                    {count}
                  </Typography>
                </Button>
              );
            })}
            <Typography sx={{ fontWeight: 800, pt: 0.25 }}>
              Total laissé en caisse : {drawerTotal} DH
            </Typography>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <RoundNumpad keys={COUNT_KEYS} onKey={handleKey} keySize={48} disabled={busy} />
          </Box>
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
