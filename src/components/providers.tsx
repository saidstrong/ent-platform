'use client';

import { AuthProvider } from "../lib/auth-context";
import { I18nProvider } from "../lib/i18n";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <I18nProvider>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  );
};

export default Providers;
