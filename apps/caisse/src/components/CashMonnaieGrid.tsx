import { Box, Button } from "@mui/material";
import { formatMoneyFr } from "@opf/caisse-core";
import {
  CASH_GRID_COLUMNS,
  CASH_GRID_GAP_PX,
  CASH_GRID_LAYOUT,
  CASH_GRID_ROW_TEMPLATE,
  CASH_SMALL_DENOM_AMOUNTS,
  cashDenomination,
  isMainCashDenom,
  type CashDenomination,
} from "../lib/payment-monnaie";

type Props = {
  onSelect: (denom: CashDenomination) => void;
  compact?: boolean;
};

const cellImageSx = {
  width: "100%",
  height: "100%",
  objectFit: "contain" as const,
  objectPosition: "center",
  display: "block",
};

function CashDenomButton({
  denom,
  compact,
  onSelect,
  sx,
}: {
  denom: CashDenomination;
  compact: boolean;
  onSelect: (denom: CashDenomination) => void;
  sx?: Record<string, unknown>;
}) {
  const isMain = isMainCashDenom(denom);

  return (
    <Button
      variant="outlined"
      onClick={() => onSelect(denom)}
      sx={{
        p: isMain ? (compact ? "1px" : "2px") : compact ? "1px" : "2px",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        width: "100%",
        borderColor: "#e0e0e0",
        borderRadius: compact ? "8px" : "10px",
        bgcolor: "#fff",
        boxShadow: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        lineHeight: 0,
        fontSize: 0,
        ...sx,
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: "#fafafa",
          boxShadow: "none",
        },
      }}
    >
      <Box
        component="img"
        src={denom.image}
        alt={`${formatMoneyFr(denom.amount)} DH`}
        sx={cellImageSx}
      />
    </Button>
  );
}

export default function CashMonnaieGrid({ onSelect, compact = false }: Props) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: CASH_GRID_COLUMNS,
        gridTemplateRows: CASH_GRID_ROW_TEMPLATE,
        gap: `${CASH_GRID_GAP_PX}px`,
        width: "100%",
        flex: compact ? "0 0 auto" : undefined,
        height: compact ? "auto" : undefined,
        alignSelf: compact ? "flex-start" : undefined,
        aspectRatio: compact ? undefined : "5.8 / 1",
        mb: compact ? 0 : 2,
      }}
    >
      {CASH_GRID_LAYOUT.map(({ amount, gridColumn, gridRowStart, gridRowEnd }) => {
        const denom = cashDenomination(amount);
        if (!denom) return null;

        return (
          <CashDenomButton
            key={amount}
            denom={denom}
            compact={compact}
            onSelect={onSelect}
            sx={{
              gridColumn,
              gridRow: `${gridRowStart} / ${gridRowEnd}`,
              alignSelf: "stretch",
            }}
          />
        );
      })}

      <Box
        sx={{
          gridColumn: 5,
          gridRow: "1 / 9",
          display: "flex",
          flexDirection: "column",
          gap: `${CASH_GRID_GAP_PX}px`,
          minHeight: 0,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {CASH_SMALL_DENOM_AMOUNTS.map((amount) => {
          const denom = cashDenomination(amount);
          if (!denom) return null;

          return (
            <CashDenomButton
              key={amount}
              denom={denom}
              compact={compact}
              onSelect={onSelect}
              sx={{ flex: "1 1 0", minHeight: 0 }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
