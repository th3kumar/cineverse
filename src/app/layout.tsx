import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "CINEVERSE PLAY", description: "AI movie discovery with legal playback" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <a href="/" className="brand">CINEVERSE <span>PLAY</span></a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
