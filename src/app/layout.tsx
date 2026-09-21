import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DEFAULT_THEME, THEME_BOOT } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

// Geist (OFL, Vercel; Sept 20, 2026): the user's pick of two directions compared side by side on
// the real screens — one face for everything, headings at medium weight, no monospace. One
// variable file per style covers 100–900; bundled locally so no font request leaves the app.
const geist = localFont({ variable: "--font-geist", src: [
  { path: "../fonts/Geist-variable.woff2", weight: "100 900", style: "normal" },
  { path: "../fonts/Geist-variable-italic.woff2", weight: "100 900", style: "italic" },
] });

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
    <html lang="en" suppressHydrationWarning data-theme={DEFAULT_THEME} className={cn("h-full", geist.variable)}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
