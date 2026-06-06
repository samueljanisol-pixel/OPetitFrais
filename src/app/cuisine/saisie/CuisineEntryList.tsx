"use client";

import Image from "next/image";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import AppLink from "@/components/AppLink";
import { useAppLocale } from "@/lib/i18n/useAppFormat";
import { productDisplayName } from "@/lib/products/product-display-name";
import { productPhotoPublicUrl } from "@/lib/products/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMemo } from "react";
import type { CuisineEntryType, CuisineJournalEntryWithProduct } from "@/lib/cuisine/types";
import { formatJournalTime } from "@/lib/cuisine/production-date";

type Props = {
  title: string;
  entryType: CuisineEntryType;
  entries: CuisineJournalEntryWithProduct[];
  emptyLabel: string;
  quantityLabel: (qty: number, unit: string) => string;
  timePrefix: string;
  readOnly?: boolean;
};

function salesUnitLabel(raw: CuisineJournalEntryWithProduct["product"]): string {
  const su = raw?.ref_sales_unit;
  const o = Array.isArray(su) ? su[0] : su;
  return o?.label?.trim() || "";
}

export default function CuisineEntryList({
  title,
  entryType,
  entries,
  emptyLabel,
  quantityLabel,
  timePrefix,
  readOnly = false,
}: Props) {
  const locale = useAppLocale();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const filtered = entries.filter((e) => e.entry_type === entryType);

  return (
    <section>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyLabel}
        </Typography>
      ) : (
        <List dense disablePadding>
          {filtered.map((entry) => {
            const product = entry.product;
            const name = product ? productDisplayName(product, locale) : "—";
            const unit = salesUnitLabel(product);
            const photoUrl = productPhotoPublicUrl(supabase, product?.image_path ?? null);
            const secondary = `${quantityLabel(entry.quantity, unit)} · ${timePrefix} ${formatJournalTime(locale, entry.created_at)}`;

            const content = (
              <>
                {photoUrl ? (
                  <Box
                    sx={{
                      position: "relative",
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      overflow: "hidden",
                      flexShrink: 0,
                      mr: 1.5,
                      bgcolor: "grey.100",
                    }}
                  >
                    <Image src={photoUrl} alt="" fill sizes="48px" style={{ objectFit: "cover" }} />
                  </Box>
                ) : null}
                <ListItemText
                  primary={name}
                  secondary={secondary}
                  slotProps={{
                    primary: {
                      sx: { fontWeight: 600 },
                      dir: locale === "ar-MA" ? "rtl" : undefined,
                    },
                  }}
                />
              </>
            );

            if (readOnly) {
              return (
                <ListItem
                  key={entry.id}
                  disablePadding
                  sx={{
                    mb: 1,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    px: 1.5,
                    py: 1,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {content}
                </ListItem>
              );
            }

            return (
              <ListItem key={entry.id} disablePadding className="!mb-1">
                <ListItemButton
                  component={AppLink}
                  href={`/cuisine/saisie/quantite?entryId=${encodeURIComponent(entry.id)}`}
                  sx={{
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {content}
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
    </section>
  );
}
