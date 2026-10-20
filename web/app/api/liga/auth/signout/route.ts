import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const res = NextResponse.json({ ok: true });
  res.cookies.set("hh_user_type", "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
