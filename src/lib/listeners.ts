import { onSnapshot, type DocumentData, type DocumentReference, type Query } from "firebase/firestore";

type ListenerMeta = {
  uid?: string | null;
  role?: string | null;
  route?: string;
  constraints?: Array<{ field: string; op: string; value: unknown }>;
  path?: string;
  desc?: string;
};

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

let lastError: ListenerErrorInfo | null = null;
let listenerSeq = 0;
const errorSubscribers = new Set<(info: ListenerErrorInfo) => void>();

export const subscribeToListenerErrors = (cb: (info: ListenerErrorInfo) => void) => {
  errorSubscribers.add(cb);
  if (lastError) cb(lastError);
  return () => {
    errorSubscribers.delete(cb);
  };
};

const extractCaller = (stack?: string) => {
  if (!stack) return undefined;
  const lines = stack.split("\n").map((line) => line.trim());
  for (const line of lines) {
    if (!line) continue;
    if (line.includes("src/lib/listeners") || line.includes("listenWithTag")) continue;
    if (line.includes("node_modules")) continue;
    return line;
  }
  return undefined;
};

type ListenerOnNext = (snap: any) => void;
type ListenerOnError = (err: any) => void;

export const listenWithTag = <T extends DocumentData>(
  tag: string,
  ref: Query<T> | DocumentReference<T>,
  onNext: ListenerOnNext,
  onError?: ListenerOnError,
  meta: ListenerMeta = {},
) => {
  const listenerId = `L${++listenerSeq}`;
  const stack = process.env.NODE_ENV !== "production" ? new Error().stack : undefined;
  const stackPreview =
    process.env.NODE_ENV !== "production" && stack
      ? stack.split("\n").slice(0, 8).join("\n")
      : undefined;
  const caller = process.env.NODE_ENV !== "production" ? extractCaller(stack) : undefined;
  if (process.env.NODE_ENV !== "production") {
    console.info(`[fs-listen:start] id=${listenerId} tag=${tag} desc=${meta.desc ?? ""} at=${caller ?? "unknown"}`, {
      path: meta.path,
      constraints: meta.constraints,
      uid: meta.uid ?? null,
      role: meta.role ?? null,
      route: meta.route,
    });
  }
  const unsubscribe = onSnapshot(ref as Query<T>, onNext as (snap: any) => void, (err) => {
    if (process.env.NODE_ENV !== "production") {
      const info: ListenerErrorInfo = {
        tag,
        code: (err as { code?: string }).code,
        message: (err as { message?: string }).message,
        desc: meta.desc,
        path: meta.path,
        constraints: meta.constraints,
        uid: meta.uid ?? null,
        role: meta.role ?? null,
        route: meta.route,
        stack: stackPreview,
      };
      lastError = info;
      errorSubscribers.forEach((fn) => fn(info));
      console.error(
        `[fs-listen:error] id=${listenerId} tag=${info.tag} desc=${info.desc ?? ""} code=${info.code ?? ""} message=${info.message ?? ""} at=${caller ?? "unknown"}`,
        info,
      );
    }
    if (onError) onError(err);
  });
  return () => {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[fs-listen:remove] id=${listenerId} tag=${tag}`);
    }
    unsubscribe();
  };
};

export const listenTagged = listenWithTag;
