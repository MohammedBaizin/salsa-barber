import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Settings" };

/** Built in phase 11. */
export default function Page() {
  return <ComingSoon title="Settings" roles={["owner", "admin"]}>Opening hours, closed days and booking rules are coming soon.</ComingSoon>;
}
