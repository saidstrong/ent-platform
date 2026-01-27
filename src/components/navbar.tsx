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
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-4">
          <button className="rounded-md border border-neutral-200 p-2 md:hidden" onClick={() => setOpen((v) => !v)}>
            <Menu size={18} />
          </button>
          <Link href="/" className="text-lg font-semibold text-blue-700">
            Coursolingo
          </Link>
          <nav className="hidden items-center gap-4 md:flex">
            <NavLink href="/courses" label={t("browseCourses")} />
            {user && <NavLink href="/my-courses" label={t("myCourses")} />}
            {user && <NavLink href="/dashboard" label={t("dashboard")} />}
            {isAdmin(profile?.role) && <NavLink href="/admin" label={t("admin")} />}
            {(isTeacher(profile?.role) || isAdmin(profile?.role)) && <NavLink href="/teacher" label="Teacher" />}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold">
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
              <Button variant="ghost" onClick={async () => logout()} title="Logout">
                <LogOut size={16} />
              </Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={() => router.push("/login")}>
                {t("login")}
              </Button>
              <Button onClick={() => router.push("/signup")}>{t("signup")}</Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3">
            <NavLink href="/courses" label={t("browseCourses")} />
            {user && <NavLink href="/my-courses" label={t("myCourses")} />}
            {user && <NavLink href="/dashboard" label={t("dashboard")} />}
            {isAdmin(profile?.role) && <NavLink href="/admin" label={t("admin")} />}
            {(isTeacher(profile?.role) || isAdmin(profile?.role)) && <NavLink href="/teacher" label="Teacher" />}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
