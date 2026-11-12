import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Backup" };

/** Built in phase 17. */
export default function Page() {
  return <ComingSoon title="Backup" roles={["admin"]}>Downloading and restoring backups is coming soon.</ComingSoon>;
}
