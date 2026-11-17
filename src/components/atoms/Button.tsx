import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "quiet" | "secondary" | "primary";
  size?: "xs" | "sm" | "md";
  children: ReactNode;
};

export function Button({
  variant = "quiet",
  size = "xs",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const variantClasses =
    variant === "primary"
      ? "bg-ink text-surface hover:opacity-90"
      : variant === "secondary"
        ? "bg-surface text-ink shadow-btn hover:bg-hover"
        : "text-ink-2 hover:bg-hover-2 hover:text-ink";

  const sizeClasses =
    size === "xs"
      ? "h-7 px-2.5 text-[12.5px] gap-1 rounded-full"
      : size === "sm"
        ? "h-8 px-3 text-[13px] gap-1.5 rounded-control"
        : "h-9 px-4 text-[13.5px] gap-2 rounded-control";

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center font-normal whitespace-nowrap transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.96] ${variantClasses} ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
}
