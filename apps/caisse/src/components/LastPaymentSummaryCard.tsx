import { Box, Paper, Typography } from "@mui/material";
import { formatMoneyDh } from "@opf/caisse-core";
import { formatCashierClock } from "../lib/status-bar";

export type LastPaymentSummary = {
  paidAt: Date;
  total: number;
  totalPaid: number;
  change: number;
  payments: Array<{ label: string; amount: number }>;
};

type Props = {
  summary: LastPaymentSummary;
};

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "baseline" }}>
      <Typography
        variant="caption"
        sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.2, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontSize: bold ? 12 : 11,
          fontWeight: bold ? 800 : 600,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
          textAlign: "right",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function LastPaymentSummaryCard({ summary }: Props) {
  const { paidAt, total, totalPaid, change, payments } = summary;
  const positivePayments = payments.filter((p) => p.amount > 0);

  return (
    <Paper
      elevation={0}
      sx={{
        mx: 0.25,
        mb: 0.5,
        p: 0.75,
        bgcolor: "#fffde7",
        border: "1px solid",
        borderColor: "warning.light",
        borderRadius: 1,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "warning.dark",
          mb: 0.25,
        }}
      >
        Dernier ticket
      </Typography>
      <Typography
        sx={{
          fontSize: 10,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
          color: "text.secondary",
          mb: 0.6,
        }}
      >
        {formatCashierClock(paidAt)}
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}>
        <SummaryRow label="Total panier" value={formatMoneyDh(total)} />
        <SummaryRow label="Total encaissé" value={formatMoneyDh(totalPaid)} />

        <Box sx={{ mt: 0.35, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {positivePayments.map((payment) => (
            <Box
              key={`${payment.label}-${payment.amount}`}
              sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15, color: "text.primary" }}>
                {payment.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.15,
                  color: "text.primary",
                }}
              >
                {formatMoneyDh(payment.amount)}
              </Typography>
            </Box>
          ))}
        </Box>

        {change >= 0.005 ? (
          <Box
            sx={{
              mt: 0.5,
              pt: 0.5,
              borderTop: "1px dashed",
              borderColor: "success.light",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 1,
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "success.dark" }}>
              Monnaie rendue
            </Typography>
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
                color: "success.dark",
                lineHeight: 1,
              }}
            >
              {formatMoneyDh(change)}
            </Typography>
          </Box>
        ) : change <= -0.005 ? (
          <SummaryRow label="Reste à payer" value={formatMoneyDh(Math.abs(change))} bold />
        ) : null}
      </Box>
    </Paper>
  );
}
