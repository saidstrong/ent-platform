import { clsx } from "clsx";

export const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={clsx("inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700", className)}>
    {children}
  </span>
);

export default Badge;
