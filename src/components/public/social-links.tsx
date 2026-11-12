import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const LABELS: Record<keyof typeof site.socials, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  snapchat: "Snapchat",
};

export function SocialLinks({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-5 gap-y-1", className)} aria-label="Social media">
      {(Object.keys(site.socials) as (keyof typeof site.socials)[]).map((key) => (
        <li key={key}>
          <a
            href={site.socials[key]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline underline-offset-4 hover:no-underline"
          >
            {LABELS[key]}
          </a>
        </li>
      ))}
    </ul>
  );
}
