import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";
import "./globals.css";
import MobileNav from "@/components/layout/MobileNav";
import BottomNav from "@/components/layout/BottomNav";

const bebasNeue = Bebas_Neue({
  weight: "400",
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
      <body className={bebasNeue.className}>
        <MobileNav />
        <main className="min-h-screen bg-[#faf9f6] pb-16 md:pb-0">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
