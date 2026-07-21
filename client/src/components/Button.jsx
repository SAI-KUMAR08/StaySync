import React from "react";

const variants = {
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow-md hover:shadow-primary/20 active:shadow-sm",
  secondary:
    "bg-white text-text-primary border border-border hover:bg-neutral-50 hover:border-neutral-300 shadow-sm active:shadow-none",
  ghost:
    "bg-transparent text-text-secondary hover:bg-neutral-50 hover:text-text-primary",
  danger:
    "bg-danger text-white hover:bg-[#9E3232] shadow-sm hover:shadow-md hover:shadow-danger/20 active:shadow-sm",
};

const sizes = {
  sm: "h-8 min-w-[2rem] px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 min-w-[2.5rem] px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 min-w-[3rem] px-6 text-base gap-2.5 rounded-xl",
  xl: "h-14 min-w-[3.5rem] px-8 text-base gap-3 rounded-2xl",
};

const Button = ({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  fullWidth = false,
  disabled = false,
  loading = false,
  type = "button",
  onClick,
  className = "",
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center font-medium cursor-pointer transition-all duration-150 ease-out select-none whitespace-nowrap leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1";

  const stateClasses = disabled
    ? "opacity-40 cursor-not-allowed pointer-events-none"
    : "active:scale-[0.97]";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={[
        base,
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        fullWidth ? "w-full" : "",
        stateClasses,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {!loading && Icon && iconPosition === "left" && (
        <Icon size={size === "sm" ? 16 : size === "md" ? 18 : 20} className="shrink-0" />
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && Icon && iconPosition === "right" && (
        <Icon size={size === "sm" ? 16 : size === "md" ? 18 : 20} className="shrink-0" />
      )}
    </button>
  );
};

export default React.memo(Button);
