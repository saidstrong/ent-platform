import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  fullWidth?: boolean;
};

export const Button = ({ className, variant = "primary", size = "md", fullWidth, ...rest }: Props) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
  const sizeCls: Record<"sm" | "md", string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2",
  };
  const styles: Record<"primary" | "secondary" | "ghost", string> = {
    primary: "bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 shadow-sm",
    secondary: "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--card)]",
    ghost: "bg-transparent text-[var(--text)] hover:bg-[var(--card)]",
  };
  return <button className={clsx(base, sizeCls[size], styles[variant], fullWidth && "w-full", className)} {...rest} />;
};

export default Button;
