import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AETHER TIDE — Orollar: Gorizont Tutilishi",
  description: "16 ta orol, 16 ta biom, haqiqiy okean, birinchi shaxs jangi va multiplayer. Gorizontni egalla!",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body className="antialiased">{children}</body>
    </html>
  );
}
