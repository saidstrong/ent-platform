import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import "katex/dist/katex.min.css";
import Providers from "../components/providers";
import Navbar from "../components/navbar";
import type { Language } from "../lib/types";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const kzFont = localFont({
  src: "../../public/fonts/KZFont.ttf",
  variable: "--font-kz",
  display: "swap",
});

export const metadata: Metadata = {
  title: "XY-School",
  description: "Online education center",
  icons: {
    icon: "/favicon.ico",              // browser tab
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",    // iOS
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("lang")?.value as Language | undefined;
  const initialLang: Language = langCookie === "en" || langCookie === "kz" ? langCookie : "kz";

  return (
    <html lang={initialLang} suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${kzFont.variable} ${
          initialLang === "kz" ? "font-kz" : ""
        } bg-[var(--bg)] text-[var(--text)] antialiased`}
      >
        <Providers initialLang={initialLang}>
          <Navbar />
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
