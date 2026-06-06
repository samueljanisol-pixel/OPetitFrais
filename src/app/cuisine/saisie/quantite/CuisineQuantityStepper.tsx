"use client";

import { Box, Button, Typography } from "@mui/material";
import { clampCuisineQuantity } from "@/lib/cuisine/clamp-quantity";

type Props = {
  value: number;
  onChange: (value: number) => void;
  unitLabel?: string;
  labels: {
    minusTen: string;
    minusOne: string;
    plusOne: string;
    plusTen: string;
  };
};

export default function CuisineQuantityStepper({ value, onChange, unitLabel, labels }: Props) {
  const applyDelta = (delta: number) => {
    onChange(clampCuisineQuantity(value + delta));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography variant="h3" component="span" sx={{ fontWeight: 700, minWidth: 80, textAlign: "center" }}>
          {value}
        </Typography>
        {unitLabel ? (
          <Typography variant="body1" color="text.secondary">
            {unitLabel}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          gap: 1,
          width: "100%",
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => applyDelta(-10)}
          sx={{ flex: 1, minWidth: 0, py: 1.25, px: 0.5, fontWeight: 700 }}
        >
          {labels.minusTen}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => applyDelta(-1)}
          sx={{ flex: 1, minWidth: 0, py: 1.25, px: 0.5, fontWeight: 700 }}
        >
          {labels.minusOne}
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => applyDelta(1)}
          sx={{ flex: 1, minWidth: 0, py: 1.25, px: 0.5, fontWeight: 700 }}
        >
          {labels.plusOne}
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => applyDelta(10)}
          sx={{ flex: 1, minWidth: 0, py: 1.25, px: 0.5, fontWeight: 700 }}
        >
          {labels.plusTen}
        </Button>
      </Box>
    </Box>
  );
}
