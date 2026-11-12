import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Calendar" };

/** Built in phase 7. */
export default function Page() {
  return <ComingSoon title="Calendar">Day and upcoming views of every booking are coming next.</ComingSoon>;
}
