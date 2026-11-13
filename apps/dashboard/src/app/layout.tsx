import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// The interface typeface is Readex Pro, a variable font (weights 160–700) that covers Arabic and Latin.
// It is self-hosted, so no page depends on an external font service. Official PDFs and the invitation image use its static Regular and Bold files.
const qararSans = localFont({
  src: "../assets/fonts/ReadexPro-Variable.ttf",
  weight: "160 700",
  variable: "--font-qarar",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "قرار | منصة حوكمة المجالس",
    template: "%s | قرار",
  },
  description: "منصة قرار لحوكمة أعمال المجالس واللجان",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={qararSans.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
