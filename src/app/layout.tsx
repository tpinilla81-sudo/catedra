import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CATEDRA by Método — El ecosistema del cuerpo técnico",
  description:
    "Motor de decisiones metodológicas de élite para entrenadores de fútbol profesional y cantera. Biblioteca de la Cátedra, ingesta exprés post-partido y microciclo prescriptivo.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-cream text-peel`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
