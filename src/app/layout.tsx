import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DEFAULT_THEME, THEME_BOOT } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

// Figtree, the open-licence stand-in for Centra No2 (the face Gusto runs in its product; a
// commercial font, so we ship the closest OFL match). One variable file covers every weight.
const figtree = localFont({ variable: "--font-figtree", src: [
  { path: "../fonts/Figtree-variable.woff2", weight: "300 900", style: "normal" },
] });
// Identifiers — PMI, HCPCS codes, dates, unit counts — are data, and data reads better in a
// monospace beside Montserrat. 400 and 500 only, matching the sans.

export const metadata: Metadata = {
  title: { default: "EVVora", template: "%s · EVVora" },
  description: "Electronic health record for Minnesota 245D-licensed providers",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "EVVora" },
};

export const viewport: Viewport = {
  themeColor: "#f0efeb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning data-theme={DEFAULT_THEME} className={cn("h-full", figtree.variable)}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
