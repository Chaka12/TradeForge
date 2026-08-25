import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TradeForge - Trading Simulator & Charting Workstation",
  description: "High-performance offline-first trading simulator with rewindable historical simulation, charting, and strategy testing. Built with Next.js, TypeScript, and TradingView Lightweight Charts.",
  keywords: ["TradeForge", "trading simulator", "charting", "backtesting", "paper trading", "Next.js", "TypeScript"],
  authors: [{ name: "TradeForge" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "TradeForge - Trading Simulator",
    description: "Offline-first trading simulator with time-machine chart scrubbing and strategy testing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeForge - Trading Simulator",
    description: "Offline-first trading simulator with time-machine chart scrubbing and strategy testing",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
