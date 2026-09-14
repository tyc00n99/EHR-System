import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DEFAULT_THEME, THEME_BOOT } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

// Plus Jakarta Sans, identified from the reference recording. Four real weights, so headings can
// use 600 instead of leaning on size alone the way Montserrat's two cuts forced.
const jakarta = localFont({ variable: "--font-jakarta", src: [
  { path: "../fonts/PlusJakartaSans-400.woff2", weight: "400", style: "normal" },
  { path: "../fonts/PlusJakartaSans-500.woff2", weight: "500", style: "normal" },
  { path: "../fonts/PlusJakartaSans-600.woff2", weight: "600", style: "normal" },
  { path: "../fonts/PlusJakartaSans-700.woff2", weight: "700", style: "normal" },
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
    <html lang="en" suppressHydrationWarning data-theme={DEFAULT_THEME} className={cn("h-full", jakarta.variable)}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
