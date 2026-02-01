'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { useAuth, isAdmin, isTeacher } from "../lib/auth-context";
import { useI18n } from "../lib/i18n";

const NavLink = ({ href, label }: { href: string; label: string }) => {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} className={`text-sm font-medium transition hover:text-blue-700 ${active ? "text-blue-700" : "text-neutral-700"}`}>
      {label}
    </Link>
  );
};

export const Navbar = () => {
  const { user, profile, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 w-full max-w-full overflow-x-hidden border-b border-neutral-200 bg-white/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-4 md:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <button className="rounded-md border border-neutral-200 p-2 md:hidden" onClick={() => setOpen((v) => !v)} aria-label={t("nav.toggleMenu")}>
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <Link href="/" className="block truncate text-lg font-semibold text-blue-700">
              XY-School
            </Link>
          </div>
          <nav className="hidden items-center gap-4 md:flex">
            <NavLink href="/courses" label={t("nav.courses")} />
            {user && <NavLink href="/my-courses" label={t("nav.myCourses")} />}
            {user && <NavLink href="/dashboard" label={t("nav.dashboard")} />}
            {isAdmin(profile?.role) && <NavLink href="/admin" label={t("nav.admin")} />}
            {(isTeacher(profile?.role) || isAdmin(profile?.role)) && <NavLink href="/teacher" label={t("nav.teacher")} />}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold">
            <Globe size={14} className="text-blue-600" />
            <button className={`px-2 ${lang === "kz" ? "text-blue-700" : "text-neutral-500"}`} onClick={() => setLang("kz")}>
              KZ
            </button>
            <span className="text-neutral-300">|</span>
            <button className={`px-2 ${lang === "en" ? "text-blue-700" : "text-neutral-500"}`} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-neutral-600 md:block">{profile?.displayName || user.email}</span>
              <Button variant="ghost" size="sm" className="md:px-4 md:py-2 md:text-sm" onClick={async () => logout()} title={t("nav.logout")}>
                <LogOut size={16} />
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="px-3 py-2 text-sm whitespace-nowrap md:px-4 md:py-2 md:text-sm"
                onClick={() => router.push("/login")}
              >
                {t("nav.login")}
              </Button>
              <Button
                size="sm"
                className="hidden px-3 py-2 text-sm whitespace-nowrap sm:inline-flex md:px-4 md:py-2 md:text-sm"
                onClick={() => router.push("/signup")}
              >
                {t("nav.signup")}
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3">
            <NavLink href="/courses" label={t("nav.courses")} />
            {user && <NavLink href="/my-courses" label={t("nav.myCourses")} />}
            {user && <NavLink href="/dashboard" label={t("nav.dashboard")} />}
            {isAdmin(profile?.role) && <NavLink href="/admin" label={t("nav.admin")} />}
            {(isTeacher(profile?.role) || isAdmin(profile?.role)) && <NavLink href="/teacher" label={t("nav.teacher")} />}
            {!user && (
              <div className="flex flex-col gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>
                  {t("nav.login")}
                </Button>
                <Button size="sm" onClick={() => router.push("/signup")}>
                  {t("nav.signup")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
