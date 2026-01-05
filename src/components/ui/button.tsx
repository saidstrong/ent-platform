import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  fullWidth?: boolean;
};

export const Button = ({ className, variant = "primary", size = "md", fullWidth, ...rest }: Props) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const sizeCls: Record<"sm" | "md", string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2",
  };
  const styles: Record<"primary" | "secondary" | "ghost", string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
    ghost: "bg-transparent text-neutral-900 hover:bg-neutral-100",
  };
  return <button className={clsx(base, sizeCls[size], styles[variant], fullWidth && "w-full", className)} {...rest} />;
};

export default Button;
