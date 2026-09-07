import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DEFAULT_THEME, THEME_BOOT } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

const montserrat = localFont({ variable: "--font-montserrat", src: [
  { path: "../fonts/Montserrat-400.ttf", weight: "400" },
  { path: "../fonts/Montserrat-500.ttf", weight: "500" },
] });
const publicSans = localFont({ variable: "--font-public-sans", src: [
  { path: "../fonts/PublicSans-Regular.ttf", weight: "400" },
  { path: "../fonts/PublicSans-Medium.ttf", weight: "500" },
  { path: "../fonts/PublicSans-SemiBold.ttf", weight: "600" },
  { path: "../fonts/PublicSans-Bold.ttf", weight: "700" },
] });
const fraunces = localFont({ variable: "--font-fraunces", src: "../fonts/Fraunces9pt-Regular.ttf" });
const inconsolata = localFont({ variable: "--font-inconsolata", src: "../fonts/Inconsolata-Regular.ttf" });
// Identifiers — PMI, HCPCS codes, dates, unit counts — are data, and data reads better in a
// monospace beside Montserrat. 400 and 500 only, matching the sans.
const plexMono = localFont({ variable: "--font-plex-mono", src: [
  { path: "../fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
  { path: "../fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
] });

export const metadata: Metadata = {
  title: { default: "245D EHR", template: "%s · 245D EHR" },
  description: "Electronic health record for Minnesota 245D-licensed providers",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "245D EHR" },
};

export const viewport: Viewport = {
  themeColor: "#f0efeb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning data-theme={DEFAULT_THEME} className={cn("h-full", publicSans.variable, fraunces.variable, inconsolata.variable, plexMono.variable, montserrat.variable)}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
