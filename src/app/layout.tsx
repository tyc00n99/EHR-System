import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DEFAULT_THEME, THEME_BOOT } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

// Instrument Sans (OFL, Sept 20, 2026): the user's pick after comparing seven faces on the real
// screens. One variable file per style covers 400–700; bundled locally so no font request leaves
// the app at build or run time.
const instrument = localFont({ variable: "--font-instrument", src: [
  { path: "../fonts/InstrumentSans-variable.woff2", weight: "400 700", style: "normal" },
  { path: "../fonts/InstrumentSans-variable-italic.woff2", weight: "400 700", style: "italic" },
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
    <html lang="en" suppressHydrationWarning data-theme={DEFAULT_THEME} className={cn("h-full", instrument.variable)}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
