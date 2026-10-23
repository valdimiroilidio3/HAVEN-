import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HAVEN® — Thirteen houses, one quiet landscape",
    template: "%s · HAVEN®",
  },
  description:
    "HAVEN® is a private condominium of thirteen houses in the Algarve, presented through an interactive 3D masterplan, with a complete property management platform.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  openGraph: {
    title: "HAVEN® — Thirteen houses, one quiet landscape",
    description: "Explore the condominium in 3D. T1 to T4 residences, private gardens and an interactive masterplan.",
    type: "website",
    images: ["/media/demo/villa-dusk.jpg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F5F4EF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-porcelain text-obsidian antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-obsidian focus:px-4 focus:py-2 focus:text-sm focus:text-porcelain"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
