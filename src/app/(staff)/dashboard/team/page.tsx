import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Team" };

/** Built in phase 9. */
export default function Page() {
  return <ComingSoon title="Team" roles={["owner", "admin"]}>Adding barbers, hours and time off is coming soon.</ComingSoon>;
}
