'use client';

import { createContext, useContext, useMemo, useState } from "react";
import type { Language } from "./types";

type Dictionary = Record<string, { kz: string; en: string }>;

const DICT: Dictionary = {
  landingTitle: { kz: "Онлайн білім орталығы", en: "Online Education Center" },
  landingSubtitle: { kz: "8 апталық ENT мат/физика бағдарламасы", en: "8-week ENT math/physics cohort" },
  browseCourses: { kz: "Курстарды қарау", en: "Browse courses" },
  dashboard: { kz: "Менің курстарым", en: "My Courses" },
  admin: { kz: "Әкімші", en: "Admin" },
  login: { kz: "Кіру", en: "Login" },
  signup: { kz: "Тіркелу", en: "Sign up" },
  buyAccess: { kz: "Қол жеткізу алу", en: "Get access" },
  startLearning: { kz: "Оқуды бастау", en: "Start learning" },
  submit: { kz: "Жіберу", en: "Submit" },
  save: { kz: "Сақтау", en: "Save" },
  create: { kz: "Құру", en: "Create" },
  update: { kz: "Жаңарту", en: "Update" },
  logout: { kz: "Шығу", en: "Logout" },
};

type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof DICT) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === "undefined") return "kz";
    const stored = window.localStorage.getItem("lang") as Language | null;
    return stored ?? "kz";
  });

  const setLang = (next: Language) => {
    setLangState(next);
    window.localStorage.setItem("lang", next);
  };

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key: keyof typeof DICT) => DICT[key]?.[lang] ?? key,
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
};

export const pickLang = <T,>(
  kz: T | undefined,
  en: T | undefined,
  lang: Language,
): T | undefined => (lang === "kz" ? kz : en ?? kz);
