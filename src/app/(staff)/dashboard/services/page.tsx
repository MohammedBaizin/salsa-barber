import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Services and prices" };

/** Built in phase 10. */
export default function Page() {
  return <ComingSoon title="Services and prices">Editing services and prices is coming soon.</ComingSoon>;
}
