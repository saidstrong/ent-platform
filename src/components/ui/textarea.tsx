import { TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = ({ className, ...rest }: Props) => {
  return (
    <textarea
      className={clsx(
        "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-2 ring-transparent focus:ring-[var(--accent)]",
        className,
      )}
      {...rest}
    />
  );
};

export default Textarea;
