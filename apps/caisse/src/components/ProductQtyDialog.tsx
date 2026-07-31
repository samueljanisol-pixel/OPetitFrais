import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  formatDecimalFr,
  formatMoneyFr,
  type CartLine,
  type CatalogProduct,
  type SalesUnitKind,
} from "@opf/caisse-core";
import FormDialog from "./FormDialog";
import RoundNumpad from "./RoundNumpad";
import {
  cartLineDisplayName,
  catalogProductDisplayName,
  type CaisseDisplayLocale,
} from "../data/catalog-helpers";

const arabicDisplaySx = {
  direction: "rtl" as const,
  fontFamily: '"Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif',
};

type EditField = "qty" | "price";

type AddProps = {
  mode: "add";
  product: CatalogProduct;
};

type EditProps = {
  mode: "edit";
  line: CartLine;
  photoUrl: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  displayLocale?: CaisseDisplayLocale;
  catalog?: readonly CatalogProduct[];
} & (AddProps | EditProps) &
  (
    | { mode: "add"; onConfirm: (qty: number) => void }
    | { mode: "edit"; onSave: (patch: { qty: number; unitPrice: number }) => void; onDelete: () => void }
  );

function parseBuffer(buffer: string): number {
  return Number.parseFloat(buffer.replace(",", "."));
}

export default function ProductQtyDialog(props: Props) {
  const { open, onClose, mode, displayLocale = "fr", catalog = [] } = props;

  const productName =
    mode === "add"
      ? catalogProductDisplayName(props.product, displayLocale)
      : cartLineDisplayName(props.line, catalog, displayLocale);
  const showArabicLabels = displayLocale === "ar";
  const productCode = mode === "add" ? props.product.code : props.line.productCode;
  const salesUnit: SalesUnitKind = mode === "add" ? props.product.salesUnit : props.line.salesUnit;
  const listUnitPrice = mode === "add" ? props.product.price : props.line.unitPrice;
  const photoUrl = mode === "add" ? props.product.photoUrl : props.photoUrl;

  const [field, setField] = useState<EditField>("qty");
  const [sign, setSign] = useState<1 | -1>(1);
  const [qtyBuffer, setQtyBuffer] = useState("");
  const [priceBuffer, setPriceBuffer] = useState("");
  /** Après ouverture ou changement de champ : la 1ʳᵉ touche remplace la valeur affichée. */
  const bufferOverwriteRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    setField("qty");
    bufferOverwriteRef.current = true;

    if (mode === "add") {
      setSign(1);
      setQtyBuffer("");
      setPriceBuffer(formatDecimalFr(props.product.price, 2));
      return;
    }

    const qty = props.line.qty;
    setSign(qty < 0 ? -1 : 1);
    setQtyBuffer(formatDecimalFr(Math.abs(qty), 3));
    setPriceBuffer(formatDecimalFr(props.line.unitPrice, 2));
  }, [open, mode, mode === "add" ? props.product.id : props.line.id]);

  if (!open) return null;
  if (mode === "edit" && !props.line) return null;
  if (mode === "add" && !props.product) return null;

  const buffer = field === "qty" ? qtyBuffer : priceBuffer;
  const setBuffer = field === "qty" ? setQtyBuffer : setPriceBuffer;
  const unitLabel = salesUnit === "kg" ? "kg" : "unité(s)";

  const handleKey = (key: string) => {
    if (key === "C") {
      bufferOverwriteRef.current = false;
      setBuffer("");
      return;
    }
    if (key === "OK") return;
    if (key === ".") {
      if (bufferOverwriteRef.current) {
        bufferOverwriteRef.current = false;
        setBuffer("0.");
        return;
      }
      if (buffer.includes(".")) return;
      setBuffer((prev) => (prev ? `${prev}.` : "0."));
      return;
    }
    if (bufferOverwriteRef.current) {
      bufferOverwriteRef.current = false;
      setBuffer(key);
      return;
    }
    setBuffer((prev) => prev + key);
  };

  const handleFieldChange = (_: React.MouseEvent<HTMLElement>, v: EditField | null) => {
    if (!v || v === field) return;
    setField(v);
    bufferOverwriteRef.current = true;
  };

  const previewQtyRaw = parseBuffer(qtyBuffer);
  const previewPriceRaw = parseBuffer(priceBuffer);
  const previewQty =
    Number.isFinite(previewQtyRaw) && previewQtyRaw !== 0 ? sign * Math.abs(previewQtyRaw) : null;
  const previewPrice = Number.isFinite(previewPriceRaw) ? previewPriceRaw : null;
  const previewTotal =
    previewQty != null && previewPrice != null
      ? Math.round(previewQty * previewPrice * 100) / 100
      : null;

  const qtyDisplay = `${qtyBuffer || "—"} ${unitLabel}`;

  const canConfirm =
    Number.isFinite(previewQtyRaw) &&
    previewQtyRaw !== 0 &&
    Number.isFinite(previewPriceRaw) &&
    previewPriceRaw >= 0;

  const handleConfirm = () => {
    if (!canConfirm || previewQty == null || previewPrice == null) return;

    if (mode === "add") {
      props.onConfirm(previewQty);
    } else {
      props.onSave({ qty: previewQty, unitPrice: previewPrice });
    }
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { minHeight: 532, maxHeight: 532 } }}
    >
      <DialogTitle
        sx={{
          pb: 0.5,
          fontSize: showArabicLabels ? 18 : 16,
          fontWeight: 800,
          minHeight: 48,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          ...(showArabicLabels ? arabicDisplaySx : null),
        }}
      >
        {productName}
      </DialogTitle>
      <DialogContent sx={{ pt: 1, minHeight: 420 }}>
        <Box sx={{ display: "flex", gap: 1.25, mb: 1, minHeight: 72 }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              flexShrink: 0,
              bgcolor: "#f5f5f5",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {photoUrl ? (
              <Box
                component="img"
                src={photoUrl}
                alt={productName}
                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 18, fontWeight: 700 }}>
                {salesUnit === "kg" ? "Kg" : "U"}
              </Typography>
            )}
          </Box>
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", minHeight: 16 }}>
              {productCode} — {formatMoneyFr(listUnitPrice)} DH/{salesUnit === "kg" ? "kg" : "u"}
            </Typography>
          </Box>
        </Box>

        {mode === "edit" ? (
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={field}
            onChange={handleFieldChange}
            sx={{ mb: 1 }}
          >
            <ToggleButton value="qty">{salesUnit === "kg" ? "Poids (kg)" : "Quantité"}</ToggleButton>
            <ToggleButton value="price">Prix unitaire</ToggleButton>
          </ToggleButtonGroup>
        ) : null}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "96px 1fr",
            alignItems: "center",
            gap: 1,
            mb: 1,
            minHeight: 36,
          }}
        >
          <ToggleButtonGroup
            exclusive
            size="small"
            value={sign}
            disabled={field === "price"}
            onChange={(_, v: 1 | -1 | null) => v != null && setSign(v)}
            sx={{ flexShrink: 0, width: 96, justifySelf: "start" }}
          >
            <ToggleButton value={1} sx={{ fontWeight: 800, minWidth: 44, flex: 1 }}>
              +
            </ToggleButton>
            <ToggleButton value={-1} sx={{ fontWeight: 800, minWidth: 44, flex: 1 }}>
              −
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography
            align="center"
            variant="h5"
            sx={{
              fontWeight: 700,
              lineHeight: "36px",
              fontVariantNumeric: "tabular-nums",
              minWidth: 0,
            }}
          >
            {field === "qty"
              ? qtyDisplay
              : `${priceBuffer || "—"} DH`}
          </Typography>
        </Box>

        <Typography
          align="center"
          variant="body2"
          color="text.secondary"
          sx={{ mb: 1, minHeight: 20, lineHeight: "20px" }}
        >
          {previewTotal != null ? `Total : ${formatMoneyFr(previewTotal)} DH` : "\u00A0"}
        </Typography>

        <Box sx={{ display: "flex", justifyContent: "center", minHeight: 228 }}>
          <RoundNumpad
            keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "."]}
            onKey={handleKey}
            keySize={52}
          />
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          justifyContent: mode === "edit" ? "space-between" : "flex-end",
          px: 2,
          pb: 1.5,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        {mode === "edit" ? (
          <Button color="error" startIcon={<DeleteOutlineOutlinedIcon />} onClick={props.onDelete}>
            Supprimer
          </Button>
        ) : null}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
            {mode === "add" ? "Ajouter" : "Valider"}
          </Button>
        </Box>
      </DialogActions>
    </FormDialog>
  );
}
