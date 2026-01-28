import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "../components/providers";
import Navbar from "../components/navbar";
import type { Language } from "../lib/types";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "XY-School",
  description: "Online education center for ENT Math/Physics cohorts",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("lang")?.value as Language | undefined;
  const initialLang: Language = langCookie === "en" || langCookie === "kz" ? langCookie : "kz";

  return (
    <html lang="en">
      <body className={`${manrope.variable} bg-slate-50 text-neutral-900 antialiased`}>
        <Providers initialLang={initialLang}>
          <Navbar />
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
