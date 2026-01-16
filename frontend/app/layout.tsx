import type { Metadata } from "next";
import "./globals.css";
import MobileNav from "@/components/layout/MobileNav";

export const metadata: Metadata = {
  title: "Lake Powell Water Data",
  description: "Track and display Lake Powell water data, boat ramp accessibility, and historical trends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MobileNav />
        <main className="min-h-screen bg-[#faf9f6]">{children}</main>
      </body>
    </html>
  );
}
