import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Account" };

/** Built in phase 15. */
export default function Page() {
  return <ComingSoon title="Account">Password, theme and two-step sign-in settings are coming soon.</ComingSoon>;
}
