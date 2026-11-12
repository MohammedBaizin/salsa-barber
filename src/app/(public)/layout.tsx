import { sectionLinks } from "@/components/public/nav";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getSiteContent } from "@/lib/site-content";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const content = await getSiteContent();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader links={sectionLinks(content)} />
      {children}
      <SiteFooter content={content} />
    </>
  );
}
