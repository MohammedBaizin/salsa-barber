import { connection, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { bookingEnabled } from "@/lib/booking/config";
import { loadAvailability } from "@/lib/booking/load";
import { availableSlots } from "@/lib/domain/availability";
import { createAdminClient } from "@/lib/supabase/admin";

const query = z.object({
  service: z.uuid(),
  barber: z.uuid().optional(),
  /** Manage token of the booking being changed: its own slot counts as free. */
  change: z.uuid().optional(),
});

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/availability?service=<id>[&barber=<id>][&change=<token>]
 * Free START TIMES ONLY for the whole booking window, grouped by London day. Runs with the secret key
 * but never returns names, phones or booking details. Unknown/inactive service → 404.
 */
export async function GET(request: NextRequest) {
  await connection();
  if (!(await bookingEnabled())) return NextResponse.json({ error: "Online booking is off" }, { status: 404, headers: noStore });

  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });

  const loaded = await loadAvailability(createAdminClient(), {
    serviceId: parsed.data.service,
    barberId: parsed.data.barber ?? null,
    now: new Date(),
    ignoreToken: parsed.data.change ?? null,
  });
  if (!loaded) return NextResponse.json({ error: "Service not found" }, { status: 404, headers: noStore });

  const days = availableSlots(loaded.input).map((d) => ({ date: d.date, times: d.times.map((t) => t.start.toISOString()) }));
  return NextResponse.json({ days }, { headers: noStore });
}
