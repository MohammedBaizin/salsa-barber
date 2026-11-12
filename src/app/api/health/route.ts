import { connection, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Health check: confirms the app can reach the database. Used by Playwright before tests and by the
 * daily Vercel Cron (keeps a free Supabase project from pausing). Returns no data.
 */
export async function GET() {
  await connection();
  const { error } = await createPublicClient().from("settings").select("id").limit(1);
  const ok = !error;
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
