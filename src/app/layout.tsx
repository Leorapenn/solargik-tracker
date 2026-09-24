import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solargik Tracker",
  description: "Project tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <nav
          style={{
            display: "flex",
            gap: "1.5rem",
            padding: "0.75rem 2rem",
            borderBottom: "1px solid #ddd",
            fontFamily: "sans-serif",
          }}
        >
          <Link href="/projects">Projects</Link>
          <Link href="/import">Import Review</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
