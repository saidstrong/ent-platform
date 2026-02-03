'use client';

import { usePathname } from "next/navigation";
import Button from "./ui/button";
import { useAssistant } from "./ai-assistant";

export default function AssistantFab() {
  const { toggle } = useAssistant();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/signup") {
    return null;
  }

  return (
    <div className="fixed z-50 right-4 md:right-6 bottom-[calc(env(safe-area-inset-bottom)+16px)] md:bottom-[calc(env(safe-area-inset-bottom)+24px)]">
      <Button
        size="sm"
        className="h-12 w-12 rounded-full p-0 border border-black/10 bg-white text-black shadow-md hover:bg-white/95 active:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:border-black/10 dark:bg-white dark:text-black"
        aria-label="AI Assistant"
        onClick={toggle}
      >
        <img src="/brand/x-mark.png" alt="" className="h-5 w-5 opacity-90" />
      </Button>
    </div>
  );
}
