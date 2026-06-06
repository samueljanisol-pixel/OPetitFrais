import type { SupabaseClient } from "@supabase/supabase-js";
import type { CuisineEntryType, CuisineJournalEntryWithProduct } from "./types";
import { normalizeProductRelation } from "./normalize-product-relation";

const ENTRY_SELECT = `
  id, journal_date, entry_type, product_id, quantity, created_by, created_at, updated_at,
  product(id, code, name, name_ar, image_path, subcategory_id,
    ref_subcategory(id, label, label_ar, sort_order),
    ref_sales_unit(label))
`;

type RawEntryRow = Omit<CuisineJournalEntryWithProduct, "product" | "quantity"> & {
  quantity: number | string;
  product: unknown;
};

function mapEntryRow(row: RawEntryRow): CuisineJournalEntryWithProduct {
  return {
    ...row,
    quantity: Number(row.quantity),
    product: normalizeProductRelation(row.product as CuisineJournalEntryWithProduct["product"]),
  };
}

export async function loadJournalEntriesForDate(
  supabase: SupabaseClient,
  journalDate: string,
): Promise<{ entries: CuisineJournalEntryWithProduct[]; error: string | null }> {
  const { data, error } = await supabase
    .from("cuisine_journal_entry")
    .select(ENTRY_SELECT)
    .eq("journal_date", journalDate)
    .order("created_at", { ascending: false });

  if (error) return { entries: [], error: error.message };

  const entries = ((data ?? []) as RawEntryRow[]).map(mapEntryRow);
  return { entries, error: null };
}

export async function loadDistinctJournalDates(
  supabase: SupabaseClient,
): Promise<{ dates: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from("cuisine_journal_entry")
    .select("journal_date")
    .order("journal_date", { ascending: false });

  if (error) return { dates: [], error: error.message };

  const seen = new Set<string>();
  const dates: string[] = [];
  for (const row of data ?? []) {
    const d = (row as { journal_date: string }).journal_date;
    if (!seen.has(d)) {
      seen.add(d);
      dates.push(d);
    }
  }
  return { dates, error: null };
}

export async function loadJournalEntryById(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ entry: CuisineJournalEntryWithProduct | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cuisine_journal_entry")
    .select(ENTRY_SELECT)
    .eq("id", entryId)
    .maybeSingle();

  if (error) return { entry: null, error: error.message };
  if (!data) return { entry: null, error: null };

  return { entry: mapEntryRow(data as RawEntryRow), error: null };
}

export async function insertJournalEntry(
  supabase: SupabaseClient,
  payload: {
    journal_date: string;
    entry_type: CuisineEntryType;
    product_id: string;
    quantity: number;
  },
): Promise<{ entry: CuisineJournalEntryWithProduct | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cuisine_journal_entry")
    .insert(payload as never)
    .select(ENTRY_SELECT)
    .single();

  if (error) return { entry: null, error: error.message };
  return { entry: mapEntryRow(data as RawEntryRow), error: null };
}

export async function updateJournalEntryQuantity(
  supabase: SupabaseClient,
  entryId: string,
  quantity: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("cuisine_journal_entry")
    .update({ quantity } as never)
    .eq("id", entryId);

  return { error: error?.message ?? null };
}

export async function deleteJournalEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("cuisine_journal_entry").delete().eq("id", entryId);
  return { error: error?.message ?? null };
}
