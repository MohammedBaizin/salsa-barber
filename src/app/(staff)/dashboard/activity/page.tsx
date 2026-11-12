import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Activity" };

/** Built in phase 11. */
export default function Page() {
  return <ComingSoon title="Activity" roles={["owner", "admin"]}>A log of every change made in the dashboard is coming soon.</ComingSoon>;
}
