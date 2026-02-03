import { clsx } from "clsx";

export const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span
    className={clsx(
      "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--text)]",
      className,
    )}
  >
    {children}
  </span>
);

export default Badge;
