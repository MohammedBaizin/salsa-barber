import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Inter } from "next/font/google";
import { site, siteUrl } from "@/lib/site";
import { getPublicTheme } from "@/lib/site-content";
import { themeScript } from "@/lib/theme";
import "./globals.css";

/*
 * Display: Archivo, set slightly expanded (width axis) for big, confident headings.
 * Accent: Instrument Serif italic for one word per heading. Body: Inter (tabular figures for prices).
 */
const display = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const accent = Instrument_Serif({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
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
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The shop's default for new visitors (Settings, cached); a visitor's own toggle wins (inline script).
  const publicDefault = await getPublicTheme();
  return (
    <html
      lang="en-GB"
      className={`${display.variable} ${accent.variable} ${body.variable} ${publicDefault === "dark" ? "dark" : ""}`}
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
