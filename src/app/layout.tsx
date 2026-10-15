import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import Link from "next/link";

import "./globals.css";

// The landing's fonts: Manrope for text, Cormorant Garamond for headings
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: "500",
  style: ["normal", "italic"],
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    template: "%s · Личная CRM",
    default: "Личная CRM",
  },
  description: "Контакты людей, которых знаю лично, и заметки о разговорах с ними",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${cormorant.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <header className="page-container pt-6 sm:pt-8">
          <div className="flex h-11 items-center border-b sm:h-14">
            <Link
              href="/"
              className="font-display text-logo font-medium sm:text-logo-lg"
            >
              Личная CRM
            </Link>
          </div>
        </header>
        <main className="page-container flex-1 pt-8 pb-16 sm:pt-12 sm:pb-24">
          {children}
        </main>
      </body>
    </html>
  );
}
