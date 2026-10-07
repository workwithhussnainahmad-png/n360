import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "outline" | "ghost" | "link" | "danger" | "success";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-semibold transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50";
    
    const variants = {
      default: "border border-brand-950 bg-brand-950 text-white hover:bg-brand-800 hover:border-brand-800",
      outline: "border border-border bg-surface text-brand-950 hover:border-brand-950 hover:bg-stone-50",
      ghost: "border border-transparent text-stone-700 hover:bg-stone-100 hover:text-brand-950",
      link: "h-auto text-brand-800 underline-offset-4 hover:underline",
      danger: "border border-danger bg-danger text-white hover:bg-red-700",
      success: "border border-success bg-success text-white hover:bg-teal-800",
    };

    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-xs",
      lg: "h-11 px-5 sm:px-7 text-sm",
      icon: "h-10 w-10 shrink-0",
    };

    return (
      <Comp
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
