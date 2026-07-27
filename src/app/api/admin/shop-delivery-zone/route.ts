import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  SHOP_CONTACT_PHONE_SETTING_KEY,
  SHOP_PICKUP_MAGASIN_ID_SETTING_KEY,
} from "@/lib/shop/livraison-types";
import { isValidDeliveryGeoJson } from "@/lib/shop/point-in-polygon";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

async function gateAdmin() {
  const a = await requireApiPermission("admin.magasins");
  if (a.ok) return a;
  return requireApiPermission("parametres.write");
}

export async function GET() {
  const gate = await gateAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const [zoneRes, contactRes, pickupRes, magasinsRes] = await Promise.all([
    service.from("shop_delivery_zone").select("id, label, geojson, active, updated_at").eq("active", true).maybeSingle(),
    service.from("ref_app_setting").select("value").eq("key", SHOP_CONTACT_PHONE_SETTING_KEY).maybeSingle(),
    service.from("ref_app_setting").select("value").eq("key", SHOP_PICKUP_MAGASIN_ID_SETTING_KEY).maybeSingle(),
    service.from("magasins").select("id, code, nom, sort_order").order("sort_order").order("nom"),
  ]);

  if (zoneRes.error) {
    return NextResponse.json({ error: zoneRes.error.message }, { status: 500 });
  }
  if (magasinsRes.error) {
    return NextResponse.json({ error: magasinsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    zone: zoneRes.data,
    contactPhone: typeof contactRes.data?.value === "string" ? contactRes.data.value : "",
    pickupMagasinId: typeof pickupRes.data?.value === "string" ? pickupRes.data.value : "",
    magasins: magasinsRes.data ?? [],
  });
}

type PutBody = {
  label?: string;
  geojson?: unknown;
  contactPhone?: string;
  pickupMagasinId?: string | null;
};

export async function PUT(req: Request) {
  const gate = await gateAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  if (body.geojson !== undefined) {
    if (!isValidDeliveryGeoJson(body.geojson)) {
      return NextResponse.json(
        { error: "GeoJSON invalide (Polygon ou MultiPolygon attendu)" },
        { status: 400 },
      );
    }
    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : "Zone de livraison";

    const { data: existing } = await service
      .from("shop_delivery_zone")
      .select("id")
      .eq("active", true)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await service
        .from("shop_delivery_zone")
        .update({
          label,
          geojson: body.geojson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      await service.from("shop_delivery_zone").update({ active: false }).eq("active", true);
      const { error } = await service.from("shop_delivery_zone").insert({
        label,
        geojson: body.geojson,
        active: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (typeof body.contactPhone === "string") {
    const digits = body.contactPhone.replace(/\D/g, "");
    if (digits.length === 0) {
      await service.from("ref_app_setting").delete().eq("key", SHOP_CONTACT_PHONE_SETTING_KEY);
    } else if (digits.length < 8) {
      return NextResponse.json({ error: "Numéro contact trop court" }, { status: 400 });
    } else {
      const { error } = await service.from("ref_app_setting").upsert(
        {
          key: SHOP_CONTACT_PHONE_SETTING_KEY,
          value: digits,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (body.pickupMagasinId !== undefined) {
    const id =
      typeof body.pickupMagasinId === "string" ? body.pickupMagasinId.trim() : "";
    if (!id) {
      await service.from("ref_app_setting").delete().eq("key", SHOP_PICKUP_MAGASIN_ID_SETTING_KEY);
    } else {
      const { data: mag } = await service.from("magasins").select("id").eq("id", id).maybeSingle();
      if (!mag) {
        return NextResponse.json({ error: "Magasin retrait introuvable" }, { status: 400 });
      }
      const { error } = await service.from("ref_app_setting").upsert(
        {
          key: SHOP_PICKUP_MAGASIN_ID_SETTING_KEY,
          value: id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
