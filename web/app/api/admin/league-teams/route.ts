import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";

export async function GET() {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("league_teams")
    .select("*")
    .order("is_our_team", { ascending: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data });
}

export async function POST(req: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const body = await req.json() as {
    name: string;
    home_pavilion?: string;
    locality?: string;
    short_name?: string;
    sigla?: string;
    contact_name?: string;
    contact_phone?: string;
    ccd_number?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }

  const normalized = body.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const slug = normalized.replace(/\s+/g, "-");

  const { data, error } = await auth.supabase
    .from("league_teams")
    .insert({
      name: body.name.trim(),
      normalized_name: normalized,
      slug,
      home_pavilion: body.home_pavilion?.trim() || null,
      locality: body.locality?.trim() || null,
      short_name: body.short_name?.trim() || null,
      sigla: body.sigla?.trim()?.toUpperCase() || null,
      contact_name: body.contact_name?.trim() || null,
      contact_phone: body.contact_phone?.trim() || null,
      ccd_number: body.ccd_number?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data }, { status: 201 });
}
