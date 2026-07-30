import { Button, Grid } from "@mui/material";

export type AlphaKeyboardMode = "text" | "email" | "phone";

/** Disposition AZERTY (français). */
const TEXT_ROWS = [
  ["A", "Z", "E", "R", "T", "Y"],
  ["Q", "S", "D", "F", "G", "H"],
  ["W", "X", "C", "V", "B", "N"],
  ["U", "I", "O", "P", "M", "É"],
  ["È", "À", "Ç", "-", "'", " "],
];

const EMAIL_ROWS = [
  ["A", "Z", "E", "R", "T", "Y"],
  ["Q", "S", "D", "F", "G", "H"],
  ["W", "X", "C", "V", "B", "N"],
  ["U", "I", "O", "P", "0", "1"],
  ["2", "3", "4", "5", "6", "7"],
  ["8", "9", "@", ".", "-", "_"],
];

const PHONE_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["+", "0", "⌫"],
];

type Props = {
  mode: AlphaKeyboardMode;
  onKey: (key: string) => void;
  disabled?: boolean;
};

export default function AlphaKeyboard({ mode, onKey, disabled = false }: Props) {
  const rows = mode === "phone" ? PHONE_ROWS : mode === "email" ? EMAIL_ROWS : TEXT_ROWS;

  return (
    <Grid container spacing={0.5}>
      {rows.map((row, rowIdx) =>
        row.map((key) => (
          <Grid key={`${rowIdx}-${key}`} size={{ xs: mode === "phone" ? 4 : 2 }}>
            <Button
              fullWidth
              variant="outlined"
              disabled={disabled}
              sx={{ minHeight: 36, fontSize: 13, px: 0.5 }}
              onClick={() => onKey(key === "⌫" ? "BACK" : key)}
            >
              {key === " " ? "␣" : key}
            </Button>
          </Grid>
        )),
      )}
      <Grid size={{ xs: 12 }}>
        <Button
          fullWidth
          variant="outlined"
          color="warning"
          disabled={disabled}
          sx={{ minHeight: 36 }}
          onClick={() => onKey("BACK")}
        >
          Effacer
        </Button>
      </Grid>
    </Grid>
  );
}
