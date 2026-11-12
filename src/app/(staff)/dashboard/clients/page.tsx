import type { Metadata } from "next";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Clients" };

/** Built in phase 8. */
export default function Page() {
  return <ComingSoon title="Clients">Search, labels and client history are coming soon.</ComingSoon>;
}
