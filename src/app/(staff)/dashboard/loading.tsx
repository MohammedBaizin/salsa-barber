import { PageSkeleton } from "@/components/dashboard/skeleton";

/** Fallback while a dashboard page's shell is on its way (pages also have their own skeletons). */
export default function DashboardLoading() {
  return <PageSkeleton />;
}
