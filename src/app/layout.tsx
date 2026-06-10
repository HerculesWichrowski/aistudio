import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "aistudio",
  description: "Build apps by chatting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
