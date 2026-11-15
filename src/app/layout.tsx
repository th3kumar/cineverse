import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CINEVERSE — find the film that fits your mood",
  description: "Tell CINE AI your vibe and get films that match — with real posters, trailers and where to watch.",
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
