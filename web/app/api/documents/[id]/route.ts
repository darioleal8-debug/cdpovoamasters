import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

async function checkAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("role, roles_extra")
    .eq("id", user.id)
    .single();
  const roles = [profile?.role, ...(profile?.roles_extra ?? [])].filter(Boolean) as string[];
  return roles.includes("admin") ? user : null;
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await checkAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = await createAdminClient();
  const formData = await req.formData();
  const file     = formData.get("file") as File | null;

  const patch: Record<string, unknown> = {};
  const title     = formData.get("title")     as string | null;
  const summary   = formData.get("summary")   as string | null;
  const category  = formData.get("category")  as string | null;
  const required  = formData.get("required");
  const adminNote = formData.get("admin_note") as string | null;
  const season    = formData.get("season")    as string | null;

  if (title?.trim())  patch.title    = title.trim();
  if (summary !== null) patch.summary = summary?.trim() || null;
  if (category)       patch.category = category;
  if (required !== null) patch.required = required === "true";
  if (adminNote !== null) patch.admin_note = adminNote?.trim() || null;
  if (season?.trim()) patch.season   = season.trim();

  if (file) {
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "Apenas PDFs" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json({ error: "Máximo 20 MB" }, { status: 400 });

    const { data: cur } = await adminClient
      .from("documents")
      .select("storage_key, version")
      .eq("id", id)
      .single();

    const newKey = `documents/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await adminClient.storage
      .from("club-documents")
      .upload(newKey, await file.arrayBuffer(), { contentType: "application/pdf" });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: { publicUrl } } = adminClient.storage.from("club-documents").getPublicUrl(newKey);
    patch.file_url    = publicUrl;
    patch.storage_key = newKey;
    patch.file_size   = file.size;
    patch.version     = (cur?.version ?? 1) + 1;

    if (cur?.storage_key) {
      await adminClient.storage.from("club-documents").remove([cur.storage_key]);
    }
  }

  const { data: doc, error } = await adminClient
    .from("documents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: doc });
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await checkAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = await createAdminClient();
  const { error } = await adminClient
    .from("documents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
