import type { Metadata, Viewport } from "next";
import { Fraunces, Inconsolata, Public_Sans } from "next/font/google";
import "./globals.css";
import { THEME_BOOT } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: "variable", axes: ["opsz", "SOFT"] });
const inconsolata = Inconsolata({ variable: "--font-inconsolata", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "245D EHR", template: "%s · 245D EHR" },
  description: "Electronic health record for Minnesota 245D-licensed providers",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "245D EHR" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("h-full", publicSans.variable, fraunces.variable, inconsolata.variable)}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
