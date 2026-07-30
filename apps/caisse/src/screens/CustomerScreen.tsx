import { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
} from "@mui/material";
import { formatMoneyDh, formatMoneyFr } from "@opf/caisse-core";
import type { CartBroadcast } from "../../electron/preload/index";

const CUSTOMER_SCREEN_SX = {
  width: "100vw",
  height: "100vh",
  bgcolor: "#ececec",
  boxSizing: "border-box",
  overflow: "hidden",
} as const;

export default function CustomerScreen() {
  const [data, setData] = useState<CartBroadcast>({
    lines: [],
    total: 0,
    lineCount: 0,
    idle: true,
  });
  const [clock, setClock] = useState(formatClock(new Date()));

  useEffect(() => {
    const t = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = window.caisseApi?.onCartUpdate((payload) => setData(payload));
    return () => unsub?.();
  }, []);

  const grouped = groupByCategory(data.lines);

  if (data.idle || data.lineCount === 0) {
    return (
      <Box
        sx={{
          ...CUSTOMER_SCREEN_SX,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          position: "relative",
        }}
      >
        <Typography variant="h3" sx={{ fontFamily: "cursive" }}>
          Bienvenue
        </Typography>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h4" color="primary.main" sx={{ fontWeight: 700 }}>
            O&apos;petit frais
          </Typography>
          <Typography variant="h6" color="error.main" sx={{ letterSpacing: 2 }}>
            FRUITS &amp; LÉGUMES
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ position: "absolute", bottom: 16 }}>
          {clock}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        ...CUSTOMER_SCREEN_SX,
        p: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ textAlign: "center", mb: 1, flexShrink: 0 }}>
        <Typography variant="h5" color="primary.main" sx={{ fontWeight: 700 }}>
          O&apos;petit frais
        </Typography>
        <Typography variant="caption" color="error.main">
          FRUITS &amp; LÉGUMES
        </Typography>
      </Box>

      <Paper sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1 }}>
        {grouped.map(([cat, lines]) => (
          <Box key={cat} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ bgcolor: "#ddd", px: 1 }}>
              {cat}
            </Typography>
            {lines.map((line) => (
              <Box
                key={`${line.productName}-${line.qty}`}
                sx={{ display: "flex", justifyContent: "space-between", py: 0.5, px: 1 }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {line.productName}
                  </Typography>
                  <Typography variant="caption" color="primary.main">
                    {line.qty} x {formatMoneyFr(line.unitPrice)}{" "}
                    {line.salesUnit === "kg" ? "DH/Kg" : "DH/Unité"}
                  </Typography>
                </Box>
                <Typography variant="body2">{formatMoneyFr(line.lineTotal)}</Typography>
              </Box>
            ))}
          </Box>
        ))}
      </Paper>

      <Paper sx={{ mt: 1, p: 1.5, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
        <Box>
          <Typography variant="subtitle2">TOTAL</Typography>
          <Typography variant="body2">{data.lineCount} article(s)</Typography>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {formatMoneyDh(data.total)}
        </Typography>
      </Paper>

      <Typography variant="body2" align="center" sx={{ mt: 1, flexShrink: 0 }}>
        {clock}
      </Typography>
    </Box>
  );
}

function formatClock(d: Date): string {
  return d.toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function groupByCategory(
  lines: CartBroadcast["lines"],
): [string, CartBroadcast["lines"]][] {
  const map = new Map<string, CartBroadcast["lines"]>();
  for (const line of lines) {
    const arr = map.get(line.categoryLabel) ?? [];
    arr.push(line);
    map.set(line.categoryLabel, arr);
  }
  return [...map.entries()];
}
