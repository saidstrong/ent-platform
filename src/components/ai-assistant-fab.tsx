'use client';

import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
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
        className="h-12 w-12 rounded-full p-0 shadow-lg"
        aria-label="AI Assistant"
        onClick={toggle}
      >
        <Bot size={18} />
      </Button>
    </div>
  );
}
