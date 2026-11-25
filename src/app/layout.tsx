import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

/*
 * Typography
 *  - Big Shoulders: condensed display face for headlines and scoreboard numerals
 *  - Schibsted Grotesk: editorial grotesk for interface text
 *  - IBM Plex Mono: statistics, identifiers, timestamps and technical labels
 * All self-hosted by next/font (no requests to Google from the browser).
 */
// next/font has no fallback metrics for Big Shoulders, so use an explicit narrow fallback instead of auto-adjust.
const display = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: "variable",
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "Roboto Condensed", "sans-serif"],
});
const sans = Schibsted_Grotesk({ variable: "--font-schibsted", subsets: ["latin"], weight: "variable" });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "FenaFilter: AI football screenshot filtering", template: "%s · FenaFilter" },
  description:
    "Upload football fixtures, tell the AI what to remove, and receive a cleaner screenshot backed by real football statistics.",
};

export const viewport: Viewport = {
  themeColor: "#121311",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink text-fg">{children}</body>
    </html>
  );
}
