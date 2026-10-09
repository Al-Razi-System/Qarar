import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// The interface typeface is self-hosted from the files already shipped for the
// minutes PDF, so no page ever depends on an external font service.
const qararSans = localFont({
  src: [
    { path: "../assets/fonts/IBMPlexSansArabic-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/IBMPlexSansArabic-Bold.ttf", weight: "700", style: "normal" },
  ],
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
