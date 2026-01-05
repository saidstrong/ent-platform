import { SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = ({ className, children, ...rest }: Props) => (
  <select
    className={clsx(
      "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:ring-blue-200",
      className,
    )}
    {...rest}
  >
    {children}
  </select>
);

export default Select;
