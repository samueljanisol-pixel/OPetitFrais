import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Alert,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatMoneyDh,
  formatMoneyDhFixed,
  formatMoneyFr,
  roundMoney,
  type PaymentMode,
} from "@opf/caisse-core";
import {
  PAYMENT_MODES,
  paymentModeConfig,
  paymentModeLabel,
  type CashDenomination,
} from "../lib/payment-monnaie";
import CashMonnaieGrid from "./CashMonnaieGrid";
import RoundNumpad from "./RoundNumpad";

type PaymentRow = {
  id: string;
  mode: PaymentMode;
  amount: number;
  /** Montants ajoutés via la grille monnaie (ligne Espèces uniquement). */
  cashDenominations?: number[];
};

const CASH_PAYMENT_ID = "payment-cash";

function paymentRowId(mode: PaymentMode): string {
  return mode === "cash" ? CASH_PAYMENT_ID : `payment-${mode}`;
}

function formatCashDenominationsSummary(amounts: number[]): string {
  const counts = new Map<number, number>();
  for (const amount of amounts) {
    counts.set(amount, (counts.get(amount) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([amount, count]) =>
      count > 1 ? `${count}×${formatMoneyFr(amount)}` : formatMoneyFr(amount),
    )
    .join(", ");
}

const dialogActionBtnSx = {
  minHeight: 46,
  py: 1.1,
  px: 2,
  fontSize: 14,
  fontWeight: 700,
} as const;

const summaryRowSx = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto auto",
  alignItems: "center",
  columnGap: 1,
  px: 1.25,
  py: 0.85,
  minHeight: 44,
  bgcolor: "#efefef",
  border: "1px solid #bdbdbd",
  borderRadius: 2,
} as const;

type SummaryFooterRowProps = {
  label: string;
  value: string;
  tone?: "total" | "success" | "error";
};

function SummaryFooterRow({ label, value, tone = "total" }: SummaryFooterRowProps) {
  const bg =
    tone === "total" ? "#cfcfcf" : tone === "success" ? "#e8f5e9" : "#ffebee";
  const color =
    tone === "success" ? "#1b5e20" : tone === "error" ? "#c62828" : "text.primary";

  return (
    <Box
      sx={{
        ...summaryRowSx,
        gridTemplateColumns: "1fr auto",
        minHeight: 56,
        px: 1.75,
        py: 1.1,
        bgcolor: bg,
        borderColor: tone === "total" ? "#9e9e9e" : tone === "success" ? "#a5d6a7" : "#ef9a9a",
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: 18, color }}>{label}</Typography>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: 24,
          color,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

type PaymentSummaryListProps = {
  rows: PaymentRow[];
  selectedRowId: string | null;
  onSelect: (row: PaymentRow) => void;
  onRemove: (id: string) => void;
};

/** Hauteur minimale de la liste (≈ 3 lignes visibles). */
const PAYMENT_LIST_MIN_HEIGHT_PX = 180;

function PaymentSummaryList({ rows, selectedRowId, onSelect, onRemove }: PaymentSummaryListProps) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          height: "100%",
          boxSizing: "border-box",
          bgcolor: "#fff",
          borderRadius: 1.5,
          border: "1px solid #bdbdbd",
          p: rows.length > 0 ? 1 : 1.25,
          display: "flex",
          flexDirection: "column",
          gap: 0.65,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {rows.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              px: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
              Cliquez sur une monnaie ou saisissez un montant
            </Typography>
          </Box>
        ) : (
          rows.map((r) => {
            const config = paymentModeConfig(r.mode);
            const Icon = config?.Icon;
            const selected = selectedRowId === r.id;
            const cashBreakdown =
              r.mode === "cash" && r.cashDenominations && r.cashDenominations.length > 0
                ? formatCashDenominationsSummary(r.cashDenominations)
                : null;

            return (
              <Box
                key={r.id}
                onClick={() => onSelect(r)}
                sx={{
                  ...summaryRowSx,
                  cursor: "pointer",
                  alignItems: cashBreakdown ? "flex-start" : "center",
                  borderColor: selected ? "primary.main" : "#bdbdbd",
                  borderWidth: selected ? 2 : 1,
                  bgcolor: selected ? "rgba(25, 118, 210, 0.08)" : "#efefef",
                  px: selected ? "9px" : 1.25,
                  py: selected ? "7px" : 0.85,
                }}
              >
                {Icon ? (
                  <Icon
                    sx={{
                      fontSize: 22,
                      color: "text.secondary",
                      mt: cashBreakdown ? 0.35 : 0,
                    }}
                  />
                ) : (
                  <Box sx={{ width: 22 }} />
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
                    {paymentModeLabel(r.mode)}
                  </Typography>
                  {cashBreakdown ? (
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "text.secondary",
                        lineHeight: 1.25,
                        mt: 0.25,
                      }}
                    >
                      {cashBreakdown}
                    </Typography>
                  ) : null}
                </Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: 15,
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "right",
                    minWidth: 88,
                  }}
                >
                  {formatMoneyFr(r.amount)} DH
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`Retirer ${paymentModeLabel(r.mode)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(r.id);
                  }}
                  sx={{
                    color: "#d32f2f",
                    p: 0.25,
                    "&:hover": { bgcolor: "rgba(211, 47, 47, 0.08)" },
                  }}
                >
                  <CloseOutlinedIcon sx={{ fontSize: 22 }} />
                </IconButton>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

type PaymentSummaryFooterProps = {
  totalPaid: number;
  change: number;
};

function PaymentSummaryFooter({ totalPaid, change }: PaymentSummaryFooterProps) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 2,
        py: 1,
        bgcolor: "#dcdcdc",
        borderTop: "1px solid #bdbdbd",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      <SummaryFooterRow label="Total Paiement" value={formatMoneyDh(totalPaid)} tone="total" />
      <SummaryFooterRow
        label={change >= 0 ? "Monnaie" : "Reste à payer"}
        value={formatMoneyDh(Math.abs(change))}
        tone={change >= 0 ? "success" : "error"}
      />
    </Box>
  );
}

type Props = {
  open: boolean;
  totalDue: number;
  clientId: string | null;
  linkedShopOrder?: boolean;
  onClose: () => void;
  onValidate: (opts: {
    printTicket: boolean;
    isDelivery: boolean;
    payments: Array<{ mode: PaymentMode; label: string; amount: number }>;
    totalPaid: number;
    change: number;
  }) => void;
};

export default function PaymentDialog({
  open,
  totalDue,
  clientId,
  linkedShopOrder = false,
  onClose,
  onValidate,
}: Props) {
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [numpad, setNumpad] = useState("");
  const [delivery, setDelivery] = useState(false);
  const [creditWarning, setCreditWarning] = useState(false);
  /** Après sélection d'une ligne : la 1ʳᵉ touche remplace le montant affiché. */
  const numpadOverwriteRef = useRef(false);

  useEffect(() => {
    if (!open || !linkedShopOrder || totalDue <= 0) return;
    setDelivery(true);
    setRows([
      {
        id: paymentRowId("credit"),
        mode: "credit",
        amount: roundMoney(totalDue),
      },
    ]);
    setMode("credit");
    setNumpad(String(roundMoney(totalDue)));
    setCreditWarning(false);
    setSelectedRowId(null);
    numpadOverwriteRef.current = false;
  }, [open, linkedShopOrder, totalDue]);

  const totalPaid = useMemo(
    () => roundMoney(rows.reduce((s, r) => s + r.amount, 0)),
    [rows],
  );
  const change = roundMoney(totalPaid - totalDue);

  const selectPaymentRow = (row: PaymentRow) => {
    setSelectedRowId(row.id);
    setMode(row.mode);
    setNumpad(String(row.amount));
    numpadOverwriteRef.current = true;
    setCreditWarning(false);
  };

  const clearRowSelection = () => {
    numpadOverwriteRef.current = false;
    setSelectedRowId(null);
  };

  const addModeAmount = (paymentMode: PaymentMode, amount: number) => {
    const rounded = roundMoney(amount);
    if (rounded <= 0) return;

    setRows((prev) => {
      const existing = prev.find((r) => r.mode === paymentMode);
      if (existing) {
        return prev.map((r) =>
          r.mode === paymentMode
            ? {
                ...r,
                amount: roundMoney(r.amount + rounded),
                ...(paymentMode === "cash" ? { cashDenominations: undefined } : {}),
              }
            : r,
        );
      }
      return [
        ...prev,
        {
          id: paymentRowId(paymentMode),
          mode: paymentMode,
          amount: rounded,
          ...(paymentMode === "cash" ? { cashDenominations: undefined } : {}),
        },
      ];
    });
  };

  const addModeFullPayment = (paymentMode: PaymentMode) => {
    if (paymentMode === "credit" && clientId == null) {
      setCreditWarning(true);
      return;
    }
    setCreditWarning(false);
    setMode(paymentMode);

    const rowId = paymentRowId(paymentMode);

    if (paymentMode === "cash") {
      setRows((prev) => {
        const paidWithoutCash = roundMoney(
          prev.filter((r) => r.mode !== "cash").reduce((s, r) => s + r.amount, 0),
        );
        const targetAmount = roundMoney(Math.max(0, totalDue - paidWithoutCash));
        const existing = prev.find((r) => r.mode === "cash");

        if (existing) {
          return prev.map((r) =>
            r.mode === "cash"
              ? { ...r, amount: targetAmount, cashDenominations: undefined }
              : r,
          );
        }
        return [
          ...prev,
          {
            id: rowId,
            mode: "cash",
            amount: targetAmount,
            cashDenominations: undefined,
          },
        ];
      });

      const paidWithoutCash = roundMoney(
        rows.filter((r) => r.mode !== "cash").reduce((s, r) => s + r.amount, 0),
      );
      const targetAmount = roundMoney(Math.max(0, totalDue - paidWithoutCash));

      if (targetAmount <= 0) {
        setSelectedRowId(rowId);
        setNumpad("0");
        numpadOverwriteRef.current = true;
      } else {
        clearRowSelection();
        setNumpad("");
      }
      return;
    }

    const paid = roundMoney(rows.reduce((s, r) => s + r.amount, 0));
    const remaining = roundMoney(Math.max(0, totalDue - paid));

    setRows((prev) => {
      const existing = prev.find((r) => r.mode === paymentMode);
      if (existing) {
        return prev.map((r) =>
          r.mode === paymentMode
            ? { ...r, amount: roundMoney(r.amount + remaining) }
            : r,
        );
      }
      return [...prev, { id: rowId, mode: paymentMode, amount: remaining }];
    });

    if (remaining <= 0) {
      setSelectedRowId(rowId);
      setNumpad("0");
      numpadOverwriteRef.current = true;
    } else {
      clearRowSelection();
      setNumpad("");
    }
  };

  const addCashDenomination = (denom: CashDenomination) => {
    setMode("cash");
    clearRowSelection();
    const rounded = roundMoney(denom.amount);

    setRows((prev) => {
      const existing = prev.find((r) => r.mode === "cash");
      if (existing) {
        return prev.map((r) =>
          r.mode === "cash"
            ? {
                ...r,
                amount: roundMoney(r.amount + rounded),
                cashDenominations: [...(r.cashDenominations ?? []), denom.amount],
              }
            : r,
        );
      }
      return [
        ...prev,
        {
          id: CASH_PAYMENT_ID,
          mode: "cash",
          amount: rounded,
          cashDenominations: [denom.amount],
        },
      ];
    });
  };

  const addAmount = (amount: number) => {
    if (mode === "credit" && clientId == null) {
      setCreditWarning(true);
      return;
    }
    setCreditWarning(false);
    addModeAmount(mode, amount);
  };

  const confirmNumpad = () => {
    const v = Number.parseFloat(numpad.replace(",", "."));
    if (!Number.isFinite(v)) return;

    if (selectedRowId) {
      if (v < 0) return;
      const row = rows.find((r) => r.id === selectedRowId);
      if (!row) return;
      if (row.mode === "credit" && clientId == null) {
        setCreditWarning(true);
        return;
      }
      setCreditWarning(false);
      const rounded = roundMoney(v);
      setRows((prev) =>
        prev.map((r) =>
          r.id === selectedRowId
            ? {
                ...r,
                amount: rounded,
                ...(r.mode === "cash" ? { cashDenominations: undefined } : {}),
              }
            : r,
        ),
      );
      setNumpad("");
      numpadOverwriteRef.current = false;
      return;
    }

    if (v <= 0) return;
    addAmount(v);
    numpadOverwriteRef.current = false;
    setNumpad("");
  };

  const numpadKey = (key: string) => {
    if (key === "C") {
      numpadOverwriteRef.current = false;
      setNumpad("");
      return;
    }
    if (key === "OK") {
      confirmNumpad();
      return;
    }
    if (key === ".") {
      if (numpadOverwriteRef.current) {
        numpadOverwriteRef.current = false;
        setNumpad("0.");
        return;
      }
      setNumpad((p) => (p.includes(".") ? p : `${p}.`));
      return;
    }
    if (numpadOverwriteRef.current) {
      numpadOverwriteRef.current = false;
      setNumpad(key);
      return;
    }
    setNumpad((p) => p + key);
  };

  const hasCreditPayment = rows.some((r) => r.mode === "credit" && r.amount > 0);
  const canValidate =
    totalPaid >= totalDue - 0.001 && (!hasCreditPayment || clientId != null);

  const buildValidatePayload = (printTicket: boolean) => ({
    printTicket,
    isDelivery: delivery,
    payments: rows.map((row) => ({
      mode: row.mode,
      label: paymentModeLabel(row.mode),
      amount: row.amount,
    })),
    totalPaid,
    change,
  });

  const handleClose = () => {
    setRows([]);
    numpadOverwriteRef.current = false;
    setNumpad("");
    setMode("cash");
    clearRowSelection();
    setDelivery(false);
    setCreditWarning(false);
    onClose();
  };

  const handleRemoveRow = (id: string) => {
    setRows((p) => p.filter((x) => x.id !== id));
    if (selectedRowId === id) {
      clearRowSelection();
      setNumpad("");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: "calc(100vh - 48px)",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          m: 1.5,
        },
      }}
    >
      <DialogTitle
        sx={{
          flexShrink: 0,
          py: 1,
          px: 2,
          bgcolor: "#1a237e",
          color: "#fff",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: "rgba(255, 255, 255, 0.92)",
            }}
          >
            Total Panier :
          </Typography>
          <Typography
            component="span"
            sx={{
              fontSize: 36,
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
              color: "#fff",
            }}
          >
            {formatMoneyDhFixed(totalDue)}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent
        sx={{
          flex: "1 1 auto",
          minHeight: 0,
          p: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) auto",
        }}
      >
        <Box
          sx={{
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            gap: 1.5,
            px: 2,
            pt: 1,
            pb: 0.75,
          }}
        >
          {/* Colonne gauche : modes, monnaie, liste */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              overflow: "hidden",
              pb: 0.25,
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                gap: 0.65,
                flexShrink: 0,
                width: "100%",
              }}
            >
              {PAYMENT_MODES.map(({ id, label, Icon }) => (
                <Button
                  key={id}
                  variant="outlined"
                  disabled={id === "credit" && clientId == null}
                  onClick={() => addModeFullPayment(id)}
                  sx={{
                    flexDirection: "column",
                    gap: 0.35,
                    py: 0.85,
                    px: 0.5,
                    minWidth: 0,
                    minHeight: 64,
                    textTransform: "none",
                  }}
                >
                  <Icon sx={{ fontSize: 26 }} />
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: 12,
                      lineHeight: 1.15,
                      textAlign: "center",
                    }}
                  >
                    {label}
                  </Typography>
                </Button>
              ))}
            </Box>

            {creditWarning ? (
              <Alert severity="warning" sx={{ py: 0, flexShrink: 0 }} onClose={() => setCreditWarning(false)}>
                Sélectionnez un client pour une vente à crédit.
              </Alert>
            ) : null}

            <Box sx={{ flex: "0 0 auto", overflow: "hidden", display: "flex", alignItems: "flex-start", width: "100%" }}>
              <CashMonnaieGrid compact onSelect={addCashDenomination} />
            </Box>

            <Box
              sx={{
                flex: "1 1 0",
                minHeight: PAYMENT_LIST_MIN_HEIGHT_PX,
                maxHeight: "100%",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <PaymentSummaryList
                rows={rows}
                selectedRowId={selectedRowId}
                onSelect={selectPaymentRow}
                onRemove={handleRemoveRow}
              />
            </Box>
          </Box>

          {/* Colonne droite : clavier ancré en bas */}
          <Box
            sx={{
              width: 156,
              flexShrink: 0,
              minHeight: 0,
              alignSelf: "stretch",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              pb: 0.25,
            }}
          >
            <Typography
              align="center"
              variant="body1"
              sx={{
                width: "100%",
                minHeight: 32,
                mb: 0.5,
                bgcolor: selectedRowId ? "rgba(25, 118, 210, 0.12)" : "#eee",
                borderRadius: 1,
                lineHeight: "32px",
                fontVariantNumeric: "tabular-nums",
                fontSize: 16,
                fontWeight: 700,
                border: selectedRowId ? "1px solid" : "none",
                borderColor: "primary.main",
              }}
            >
              {numpad || "—"}
            </Typography>
            <RoundNumpad
              keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "."]}
              onKey={numpadKey}
              keySize={44}
            />
            <Box sx={{ display: "flex", justifyContent: "center", mt: 0.5 }}>
              <Button
                variant="contained"
                color="success"
                onClick={confirmNumpad}
                sx={{
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  borderRadius: "50%",
                  p: 0,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                OK
              </Button>
            </Box>
          </Box>
        </Box>

        <PaymentSummaryFooter totalPaid={totalPaid} change={change} />
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 2, pb: 1, pt: 0.25, flexShrink: 0 }}>
        <Button onClick={handleClose} sx={dialogActionBtnSx}>
          Annuler
        </Button>
        <Button
          variant={delivery ? "contained" : "outlined"}
          onClick={() => setDelivery((d) => !d)}
          sx={dialogActionBtnSx}
        >
          Livraison {delivery ? "ON" : "OFF"}
        </Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          {!linkedShopOrder ? (
            <Button
              variant="contained"
              disabled={!canValidate}
              onClick={() => {
                onValidate(buildValidatePayload(false));
                handleClose();
              }}
              sx={dialogActionBtnSx}
            >
              Valider sans ticket
            </Button>
          ) : null}
          <Button
            variant="contained"
            disabled={!canValidate}
            onClick={() => {
              onValidate(buildValidatePayload(linkedShopOrder ? true : true));
              handleClose();
            }}
            sx={dialogActionBtnSx}
          >
            Valider
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
