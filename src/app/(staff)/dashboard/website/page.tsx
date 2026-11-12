import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Website" };

/** Built in phase 12. */
export default function Page() {
  return <ComingSoon title="Website" roles={["owner", "admin"]}>Editing photos and reviews on the website is coming soon.</ComingSoon>;
}
