export const formatAnyTimestamp = (ts: unknown): string => {
  if (!ts) return "";

  let date: Date | null = null;
  const maybeAny = ts as { toDate?: () => Date; toMillis?: () => number; seconds?: number; nanoseconds?: number };

  if (maybeAny.toDate && typeof maybeAny.toDate === "function") {
    date = maybeAny.toDate();
  } else if (maybeAny.toMillis && typeof maybeAny.toMillis === "function") {
    date = new Date(maybeAny.toMillis());
  } else if (typeof ts === "object" && typeof maybeAny.seconds === "number") {
    const nanos = typeof maybeAny.nanoseconds === "number" ? maybeAny.nanoseconds : 0;
    date = new Date(maybeAny.seconds * 1000 + nanos / 1_000_000);
  } else if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) date = new Date(parsed);
  } else if (typeof ts === "number") {
    date = new Date(ts);
  }

  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};
