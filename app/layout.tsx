import type { Metadata } from "next";
import { Bebas_Neue, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "RED API — High Velocity REST API Platform",
  description: "Enterprise REST API Gateway running on distributed Pterodactyl Node with AI, Media Scraping, and Stalker services.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark bg-[#08080a]">
      <body
        className={`${bebasNeue.variable} ${jetbrainsMono.variable} ${plusJakartaSans.variable} min-h-screen flex flex-col bg-[#08080a] text-zinc-100 bg-grid bg-ambient-glow selection:bg-red-600 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
