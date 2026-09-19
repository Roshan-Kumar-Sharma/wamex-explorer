import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wamex-explorer",
  description:
    "Draw an area in Western Australia, get a cited history of everything done on that ground.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
