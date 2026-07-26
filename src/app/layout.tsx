import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Demo-Plattform",
    template: "%s · Demo-Plattform",
  },
  description:
    "Interaktive Demonstration KI-gestützter Mieterkommunikation für Hausverwaltungen.",
  // Demoseiten sollen nicht in Suchmaschinen auftauchen.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
