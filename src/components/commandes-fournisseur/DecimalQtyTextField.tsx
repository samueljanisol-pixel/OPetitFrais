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
  /** `null` = champ vide (uniquement si `emptyAsNull`). */
  value: number | null;
  /** À chaque changement utilisateur après normalisation ≥ 0, max 2 déc. ; `null` si vide et `emptyAsNull`. */
  onQtyChange: (n: number | null) => void;
  /** Si faux, aucune valeur n’est poussée pendant la frappe (commits au blur uniquement). */
  commitWhileTyping?: boolean;
  /** Borne API (défaut true). */
  clamp?: boolean;
  /**
   * Achat : vide ≠ 0.
   * - affichage : `null` → vide, `0` → « 0 »
   * - blur sur vide → `null` (pas encore saisi)
   * - saisie « 0 » → `0` (pas acheté)
   */
  emptyAsNull?: boolean;
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
  emptyAsNull = false,
  onFocus,
  onBlur,
  slotProps,
  ...rest
}: DecimalQtyTextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() =>
    formatQtyDisplayWhenBlurred(value, { showZero: emptyAsNull || (value != null && value === 0) }),
  );

  useEffect(() => {
    if (!focused) {
      setText(
        formatQtyDisplayWhenBlurred(value, {
          showZero: emptyAsNull || (value != null && value === 0),
        }),
      );
    }
  }, [value, focused, emptyAsNull]);

  const toCommitted = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return emptyAsNull ? null : 0;
    }
    const parsed = parseQtyInputToNumber(trimmed) ?? 0;
    return clamp ? clampQtyToApiRange(parsed) : Math.max(0, roundQty2(parsed));
  };

  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const next = sanitizeQtyTypingFrac2(e.target.value);
    setText(next);
    if (!commitWhileTyping) return;
    onQtyChange(toCommitted(next));
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
    const n = toCommitted(text);
    onQtyChange(n);
    setText(
      formatQtyDisplayWhenBlurred(n, {
        showZero: emptyAsNull || (n != null && n === 0),
      }),
    );
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
