import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import "./globals.css";
import MobileNav from "@/components/layout/MobileNav";
import BottomNav from "@/components/layout/BottomNav";

const oswald = Oswald({
  weight: ["300", "400"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lake Powell Water Data",
  description: "Track and display Lake Powell water data, boat ramp accessibility, and historical trends",
  manifest: "/manifest.json",
  themeColor: "#faf9f6",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lake Powell Water Data",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MobileNav oswaldFont={oswald.className} />
        <main className="min-h-screen bg-[#faf9f6] pb-16 md:pb-0" style={{ paddingBottom: 'calc(4rem + max(env(safe-area-inset-bottom, 0px), 34px))' }}>{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
