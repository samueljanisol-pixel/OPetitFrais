import { Box, Button, Grid } from "@mui/material";
import type { ReactNode } from "react";

const DEFAULT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "."];

type Props = {
  keys?: readonly string[];
  onKey: (key: string) => void;
  keySize?: number;
  disabled?: boolean;
  trailingAction?: ReactNode;
  /** Colonne complète à droite (ex. retour, supprimer, paiement). */
  sideColumn?: ReactNode;
};

function NumpadKeyButton({
  label,
  keySize,
  disabled,
  onKey,
}: {
  label: string;
  keySize: number;
  disabled: boolean;
  onKey: (key: string) => void;
}) {
  return (
    <Button
      variant="contained"
      disabled={disabled}
      sx={{
        width: keySize,
        height: keySize,
        minWidth: keySize,
        borderRadius: "50%",
        p: 0,
        fontSize: label === "OK" || label === "C" ? 13 : 16,
        fontWeight: 700,
      }}
      onClick={() => onKey(label)}
    >
      {label}
    </Button>
  );
}

export default function RoundNumpad({
  keys = DEFAULT_KEYS,
  onKey,
  keySize = 48,
  disabled = false,
  trailingAction,
  sideColumn,
}: Props) {
  if (sideColumn) {
    const bottomKeys = keys.slice(9, 12);

    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(3, ${keySize}px) minmax(${keySize}px, 1fr)`,
          gridTemplateRows: `repeat(3, ${keySize}px) ${keySize}px`,
          gap: 0.5,
          width: "100%",
        }}
      >
        {keys.slice(0, 9).map((k, index) => (
          <Box
            key={k}
            sx={{
              gridColumn: (index % 3) + 1,
              gridRow: Math.floor(index / 3) + 1,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <NumpadKeyButton label={k} keySize={keySize} disabled={disabled} onKey={onKey} />
          </Box>
        ))}
        {bottomKeys.map((k, index) => (
          <Box
            key={k}
            sx={{
              gridColumn: index + 1,
              gridRow: 4,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <NumpadKeyButton label={k} keySize={keySize} disabled={disabled} onKey={onKey} />
          </Box>
        ))}
        <Box
          sx={{
            gridColumn: 4,
            gridRow: "1 / 5",
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            alignItems: "stretch",
            minWidth: 0,
          }}
        >
          {sideColumn}
        </Box>
      </Box>
    );
  }

  if (!trailingAction) {
    return (
      <Grid container spacing={0.5}>
        {keys.map((k) => (
          <Grid key={k} size={{ xs: 4 }} sx={{ display: "flex", justifyContent: "center" }}>
            <NumpadKeyButton label={k} keySize={keySize} disabled={disabled} onKey={onKey} />
          </Grid>
        ))}
      </Grid>
    );
  }

  const bottomKeys = keys.slice(9, 12);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${keySize}px) ${keySize}px`,
        gridTemplateRows: `repeat(3, ${keySize}px) ${keySize}px`,
        gap: 0.5,
        justifyContent: "center",
      }}
    >
      {keys.slice(0, 9).map((k, index) => (
        <Box
          key={k}
          sx={{
            gridColumn: (index % 3) + 1,
            gridRow: Math.floor(index / 3) + 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <NumpadKeyButton label={k} keySize={keySize} disabled={disabled} onKey={onKey} />
        </Box>
      ))}
      {bottomKeys.map((k, index) => (
        <Box
          key={k}
          sx={{
            gridColumn: index + 1,
            gridRow: 4,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <NumpadKeyButton label={k} keySize={keySize} disabled={disabled} onKey={onKey} />
        </Box>
      ))}
      <Box
        sx={{
          gridColumn: 4,
          gridRow: "3 / 5",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        {trailingAction}
      </Box>
    </Box>
  );
}
