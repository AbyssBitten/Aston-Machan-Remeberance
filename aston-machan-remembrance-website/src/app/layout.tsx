import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aston Machan Remembrance — Do you remember Machan?",
  description:
    "A quiet, dark map of the world that glows a little brighter wherever someone remembers Aston Machan. Pressing yes uses your IP address once to place your country on the map. It is never logged or stored.",
  openGraph: {
    title: "Do you remember Machan?",
    description:
      "One button. One map. Every yes brightens the country it came from. She asked not to be forgotten.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Do you remember Machan?",
    description:
      "One button. One map. Every yes brightens the country it came from.",
  },
};

export const viewport: Viewport = {
  themeColor: "#04050a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void text-ink antialiased">{children}</body>
    </html>
  );
}
