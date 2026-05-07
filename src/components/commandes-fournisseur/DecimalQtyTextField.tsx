"use client";

import { type FocusEventHandler, type ChangeEventHandler, useEffect, useState } from "react";
import { TextField, type TextFieldProps } from "@mui/material";
import {
  clampQtyToApiRange,
  formatQtyDisplayWhenBlurred,
  parseQtyInputToNumber,
  roundQty2,
  sanitizeQtyTypingFrac2,
} from "@/lib/commandes-fournisseur/qty-parse";

export type DecimalQtyTextFieldProps = Omit<
  TextFieldProps,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number;
  /** À chaque changement utilisateur après normalisation ≥ 0, max 2 déc. */
  onQtyChange: (n: number) => void;
  /** Si faux, aucune valeur n’est poussée pendant la frappe (commits au blur uniquement via onBlurCapture interne si besoin — utiliser blur manuel). */
  commitWhileTyping?: boolean;
  /** Borne API (défaut true). */
  clamp?: boolean;
};

/**
 * Quantité décimale FR : pas de `type="number"` (zéro difficile à effacer).
 * Sélection au focus pour remplacer d’un coup.
 */
export function DecimalQtyTextField({
  value,
  onQtyChange,
  commitWhileTyping = true,
  clamp = true,
  onFocus,
  onBlur,
  slotProps,
  ...rest
}: DecimalQtyTextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatQtyDisplayWhenBlurred(value));

  useEffect(() => {
    if (!focused) {
      setText(formatQtyDisplayWhenBlurred(value));
    }
  }, [value, focused]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const next = sanitizeQtyTypingFrac2(e.target.value);
    setText(next);
    if (!commitWhileTyping) return;
    if (next.trim() === "") {
      onQtyChange(0);
      return;
    }
    const p = parseQtyInputToNumber(next);
    if (p !== null) {
      const n = clamp ? clampQtyToApiRange(p) : Math.max(0, p);
      onQtyChange(n);
    }
  };

  const handleFocus: FocusEventHandler<HTMLInputElement> = (e) => {
    setFocused(true);
    queueMicrotask(() => {
      e.target.select();
    });
    onFocus?.(e);
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = (e) => {
    setFocused(false);
    const parsed = parseQtyInputToNumber(text) ?? 0;
    const n = clamp ? clampQtyToApiRange(parsed) : Math.max(0, roundQty2(parsed));
    onQtyChange(n);
    setText(formatQtyDisplayWhenBlurred(n));
    onBlur?.(e);
  };

  const mergedSlotProps =
    typeof slotProps === "object" && slotProps !== null
      ? {
          ...slotProps,
          htmlInput: {
            inputMode: "decimal" as const,
            ...(slotProps as { htmlInput?: object }).htmlInput,
          },
        }
      : { htmlInput: { inputMode: "decimal" as const } };

  return (
    <TextField
      {...rest}
      type="text"
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      slotProps={mergedSlotProps}
    />
  );
}
