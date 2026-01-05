import { clsx } from "clsx";

export const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return <div className={clsx("rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm", className)}>{children}</div>;
};

export default Card;
