import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN, hasAnyRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Sessão + conta ativa; admin segundo o papel ativo
    const auth = await authorize();
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const isAdmin = hasAnyRole(auth.profile, ADMIN);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminClient = await createAdminClient();

    // Fetch docs without the broken auth.users FK join
    const query = adminClient
      .from("documents")
      .select("*")
      .order("updated_at", { ascending: false });

    const { data, error } = isAdmin
      ? await query
      : await query.is("archived_at", null);

    if (error) {
      console.error("[documents GET] db error:", error.code, error.message);
      throw error;
    }

    const docs = data ?? [];

    // Batch-fetch creator names from public.users
    const creatorIds = [...new Set(docs.map((d) => d.created_by).filter(Boolean))] as string[];
    let nameMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: usersData } = await adminClient
        .from("users")
        .select("id, name")
        .in("id", creatorIds);
      nameMap = Object.fromEntries((usersData ?? []).map((u) => [u.id, u.name]));
    }

    const docsWithCreator = docs.map((d) => ({
      ...d,
      creator: d.created_by ? { name: nameMap[d.created_by] ?? null } : null,
    }));

    return NextResponse.json({ documents: docsWithCreator, isAdmin });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[documents GET] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Sessão + conta ativa; admin segundo o papel ativo
    const auth = await authorize();
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const isAdmin = hasAnyRole(auth.profile, ADMIN);
    if (!user || !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData  = await req.formData();
    const file      = formData.get("file")       as File | null;
    const title     = formData.get("title")      as string | null;
    const category  = formData.get("category")   as string | null;
    const season    = formData.get("season")      as string | null;
    const summary   = formData.get("summary")     as string | null;
    const required  = formData.get("required")    === "true";
    const adminNote = formData.get("admin_note")  as string | null;
    const pageCount = formData.get("page_count");

    if (!file || !title?.trim() || !category || !season?.trim()) {
      return NextResponse.json({ error: "file, title, category e season são obrigatórios" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Apenas ficheiros PDF são aceites" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "O ficheiro não pode exceder 20 MB" }, { status: 400 });
    }

    const adminClient = await createAdminClient();
    const storageKey  = `documents/${crypto.randomUUID()}.pdf`;

    const { error: uploadError } = await adminClient.storage
      .from("club-documents")
      .upload(storageKey, await file.arrayBuffer(), { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error("Upload falhou: " + uploadError.message);

    const { data: { publicUrl } } = adminClient.storage.from("club-documents").getPublicUrl(storageKey);

    const { data: doc, error: dbError } = await adminClient
      .from("documents")
      .insert({
        season:      season.trim(),
        title:       title.trim(),
        summary:     summary?.trim() || null,
        category,
        file_url:    publicUrl,
        storage_key: storageKey,
        file_size:   file.size,
        page_count:  pageCount ? parseInt(pageCount as string, 10) || null : null,
        required,
        admin_note:  adminNote?.trim() || null,
        created_by:  user.id,
      })
      .select("*")
      .single();

    if (dbError) {
      await adminClient.storage.from("club-documents").remove([storageKey]);
      throw dbError;
    }

    return NextResponse.json({
      document: { ...doc, creator: { name: (await adminClient.from("users").select("name").eq("id", user.id).single()).data?.name ?? null } },
    }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[documents POST] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
