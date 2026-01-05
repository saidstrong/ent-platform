import { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

type Props = InputHTMLAttributes<HTMLInputElement>;

export const Input = ({ className, ...rest }: Props) => {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-blue-200",
        className,
      )}
      {...rest}
    />
  );
};

export default Input;
