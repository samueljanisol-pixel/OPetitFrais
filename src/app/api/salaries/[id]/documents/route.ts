import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { requireNonEmptyText, userCanAccessSalarie } from "@/lib/salaries/api-helpers";
import {
  loadDocumentsForSalarie,
  removeSalarieDocumentFile,
  salarieDocumentPublicUrl,
  uploadSalarieDocument,
} from "@/lib/salaries/documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("salaries.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const result = await loadDocumentsForSalarie(supabase, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ documents: result.documents });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("salaries.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const form = await req.formData();
  const file = form.get("file");
  const labelRaw = form.get("label");
  const labelResult = requireNonEmptyText(labelRaw, "label");
  if (typeof labelResult === "object") {
    return NextResponse.json({ error: labelResult.error }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const up = await uploadSalarieDocument(supabase, { salarieId: id, file });
  if (up.error || !up.path) {
    return NextResponse.json({ error: up.error ?? "Upload impossible" }, { status: 500 });
  }

  const { data: inserted, error: ie } = await supabase
    .from("salarie_document")
    .insert({
      salarie_id: id,
      label: labelResult,
      storage_path: up.path,
      mime_type: up.mimeType,
      created_by: gate.userId,
    })
    .select("id, salarie_id, label, storage_path, mime_type, created_at")
    .maybeSingle();

  if (ie || !inserted) {
    await removeSalarieDocumentFile(supabase, up.path);
    return NextResponse.json({ error: ie?.message ?? "Insertion refusée" }, { status: 500 });
  }

  const storage_path = String((inserted as { storage_path: string }).storage_path);
  return NextResponse.json(
    {
      id: String((inserted as { id: string }).id),
      salarie_id: id,
      label: labelResult,
      storage_path,
      mime_type: up.mimeType,
      url: salarieDocumentPublicUrl(supabase, storage_path),
      created_at: (inserted as { created_at: string }).created_at,
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireApiPermission("salaries.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const documentId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { documentId?: unknown }).documentId === "string"
      ? (body as { documentId: string }).documentId
      : "";
  if (!documentId) {
    return NextResponse.json({ error: "documentId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data: row, error } = await supabase
    .from("salarie_document")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("salarie_id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const path = String((row as { storage_path: string }).storage_path);
  const { error: de } = await supabase.from("salarie_document").delete().eq("id", documentId);
  if (de) return NextResponse.json({ error: de.message }, { status: 500 });

  await removeSalarieDocumentFile(supabase, path);
  return NextResponse.json({ ok: true });
}
