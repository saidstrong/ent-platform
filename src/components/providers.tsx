'use client';

import { AuthProvider } from "../lib/auth-context";
import { I18nProvider } from "../lib/i18n";
import { AssistantPanel, AssistantProvider } from "./ai-assistant";
import AssistantFab from "./ai-assistant-fab";
import DevListenerOverlay from "./dev-listener-overlay";
import type { Language } from "../lib/types";

export const Providers = ({ children, initialLang }: { children: React.ReactNode; initialLang: Language }) => {
  return (
    <I18nProvider initialLang={initialLang}>
      <AuthProvider>
        <AssistantProvider>
          {children}
          <AssistantPanel />
          <AssistantFab />
          {process.env.NODE_ENV !== "production" && <DevListenerOverlay />}
        </AssistantProvider>
      </AuthProvider>
    </I18nProvider>
  );
};

export default Providers;
