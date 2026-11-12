import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { site, siteUrl } from "@/lib/site";
import { themeScript, THEME_COLORS } from "@/lib/theme";
import "./globals.css";

/* Display: Bricolage Grotesque (characterful grotesque, optical sizes). Body: Inter (tabular figures for prices). */
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${site.name} · ${site.address.area}`,
    template: `%s · ${site.name}`,
  },
  description: `${site.name}, ${site.address.street}, ${site.address.area} ${site.address.postcode}. Book online or call ${site.phone.display}.`,
  applicationName: site.name,
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLORS.site[site.defaultPublicTheme],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Phase 2 replaces site.defaultPublicTheme with the cached Settings value (getPublicTheme()).
  const publicDefault = site.defaultPublicTheme;
  return (
    <html
      lang="en-GB"
      className={`${display.variable} ${body.variable} ${publicDefault === "dark" ? "dark" : ""}`}
      style={{ colorScheme: publicDefault }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript(publicDefault) }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
