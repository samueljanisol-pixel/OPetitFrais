import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SHOP_ACTIVE_CART_MINUTES,
  SHOP_ACTIVE_VISITOR_MINUTES,
} from "@/lib/shop/analytics-constants";

export type ShopVisitDayRow = {
  date: string;
  visitCount: number;
};

export type ShopAnalyticsDashboard = {
  todayVisits: number;
  activeVisitors: number;
  activeCarts: number;
  visitsByDay: ShopVisitDayRow[];
};

export function todayCasablancaIsoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function recordShopHeartbeat(
  supabase: SupabaseClient,
  visitorKey: string,
  lineCount: number,
  totalAmount: number,
  visitDate: string,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  const { error: visitorErr } = await supabase.from("shop_visitor").upsert(
    {
      visitor_key: visitorKey,
      last_seen_at: now,
    },
    { onConflict: "visitor_key", ignoreDuplicates: false },
  );

  if (visitorErr) return { error: visitorErr.message };

  const { error: visitErr } = await supabase.from("shop_visit_day").upsert(
    {
      visitor_key: visitorKey,
      visit_date: visitDate,
    },
    { onConflict: "visitor_key,visit_date", ignoreDuplicates: true },
  );

  if (visitErr) return { error: visitErr.message };

  const { error: cartErr } = await supabase.from("shop_cart_state").upsert(
    {
      visitor_key: visitorKey,
      line_count: lineCount,
      total_amount: totalAmount,
      updated_at: now,
    },
    { onConflict: "visitor_key" },
  );

  if (cartErr) return { error: cartErr.message };

  return { error: null };
}

export async function fetchShopAnalyticsDashboard(
  supabase: SupabaseClient,
  days: number,
): Promise<{ data: ShopAnalyticsDashboard | null; error: string | null }> {
  const safeDays = Math.min(90, Math.max(7, Math.floor(days)));
  const today = todayCasablancaIsoDate();
  const fromDate = addDaysIso(today, -(safeDays - 1));

  const visitorCutoff = minutesAgoIso(SHOP_ACTIVE_VISITOR_MINUTES);
  const cartCutoff = minutesAgoIso(SHOP_ACTIVE_CART_MINUTES);

  const [visitsRes, todayRes, activeVisitorsRes, activeCartsRes] = await Promise.all([
    supabase
      .from("shop_visit_day")
      .select("visit_date")
      .gte("visit_date", fromDate)
      .lte("visit_date", today),
    supabase
      .from("shop_visit_day")
      .select("visitor_key", { count: "exact", head: true })
      .eq("visit_date", today),
    supabase
      .from("shop_visitor")
      .select("visitor_key", { count: "exact", head: true })
      .gte("last_seen_at", visitorCutoff),
    supabase
      .from("shop_cart_state")
      .select("visitor_key", { count: "exact", head: true })
      .gt("line_count", 0)
      .gte("updated_at", cartCutoff),
  ]);

  if (visitsRes.error) return { data: null, error: visitsRes.error.message };
  if (todayRes.error) return { data: null, error: todayRes.error.message };
  if (activeVisitorsRes.error) return { data: null, error: activeVisitorsRes.error.message };
  if (activeCartsRes.error) return { data: null, error: activeCartsRes.error.message };

  const countByDate = new Map<string, number>();
  for (const row of visitsRes.data ?? []) {
    const date = String((row as { visit_date: string }).visit_date);
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }

  const visitsByDay: ShopVisitDayRow[] = [];
  for (let i = 0; i < safeDays; i += 1) {
    const date = addDaysIso(fromDate, i);
    visitsByDay.push({ date, visitCount: countByDate.get(date) ?? 0 });
  }

  return {
    data: {
      todayVisits: todayRes.count ?? 0,
      activeVisitors: activeVisitorsRes.count ?? 0,
      activeCarts: activeCartsRes.count ?? 0,
      visitsByDay,
    },
    error: null,
  };
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}
