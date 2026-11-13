import { CLIENT_LABELS, type ClientLabel } from "@/lib/domain/clients";
import { cn } from "@/lib/utils";

/** Client label chip (word + outline; never colour alone). */
const LABEL_STYLES: Record<ClientLabel, string> = {
  regular: "border-status-done-foreground text-status-done-foreground",
  new: "border-status-confirmed-foreground text-status-confirmed-foreground",
  due_back: "border-status-request-foreground bg-status-request text-status-request-foreground",
};

export function ClientLabelChip({ label }: { label: ClientLabel }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", LABEL_STYLES[label])}>
      {CLIENT_LABELS[label]}
    </span>
  );
}

