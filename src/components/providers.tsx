'use client';

import { AuthProvider } from "../lib/auth-context";
import { I18nProvider } from "../lib/i18n";
import DevListenerOverlay from "./dev-listener-overlay";
import type { Language } from "../lib/types";

export const Providers = ({ children, initialLang }: { children: React.ReactNode; initialLang: Language }) => {
  return (
    <I18nProvider initialLang={initialLang}>
      <AuthProvider>
        {children}
        {process.env.NODE_ENV !== "production" && <DevListenerOverlay />}
      </AuthProvider>
    </I18nProvider>
  );
};

export default Providers;
