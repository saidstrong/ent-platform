'use client';

import { useEffect, useState } from "react";
import { subscribeToListenerErrors } from "../lib/listeners";

type ListenerErrorInfo = {
  tag: string;
  desc?: string;
  code?: string;
  message?: string;
  uid?: string | null;
  role?: string | null;
  route?: string;
  path?: string;
  constraints?: Array<{ field: string; op: string; value: unknown }>;
  stack?: string;
};

const trimStack = (stack?: string) =>
  stack
    ? stack
        .split("\n")
        .slice(0, 8)
        .join("\n")
    : "";

export const DevListenerOverlay = () => {
  const [lastError, setLastError] = useState<ListenerErrorInfo | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    return subscribeToListenerErrors((info) => setLastError(info));
  }, []);

  if (process.env.NODE_ENV === "production" || !lastError) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] rounded-lg border border-red-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 font-semibold text-red-700">Listener error</div>
      <div className="space-y-1 text-neutral-700">
        <div><span className="font-semibold">Tag:</span> {lastError.tag}</div>
        {lastError.desc && <div><span className="font-semibold">Desc:</span> {lastError.desc}</div>}
        {lastError.code && <div><span className="font-semibold">Code:</span> {lastError.code}</div>}
        {lastError.message && <div><span className="font-semibold">Message:</span> {lastError.message}</div>}
        {lastError.path && <div><span className="font-semibold">Path:</span> {lastError.path}</div>}
        {lastError.uid && <div><span className="font-semibold">UID:</span> {lastError.uid}</div>}
        {lastError.role && <div><span className="font-semibold">Role:</span> {lastError.role}</div>}
        {lastError.route && <div><span className="font-semibold">Route:</span> {lastError.route}</div>}
      </div>
      {lastError.constraints && lastError.constraints.length > 0 && (
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-neutral-50 p-2 text-[10px] text-neutral-600">
          {JSON.stringify(lastError.constraints, null, 2)}
        </pre>
      )}
      {lastError.stack && (
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-neutral-50 p-2 text-[10px] text-neutral-600">
          {trimStack(lastError.stack)}
        </pre>
      )}
    </div>
  );
};

export default DevListenerOverlay;
