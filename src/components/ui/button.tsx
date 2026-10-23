import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss-700",
  {
    variants: {
      variant: {
        primary: "bg-obsidian text-porcelain hover:bg-ink-800 active:bg-ink-900 shadow-sm",
        secondary: "border border-ink-900/15 bg-white text-obsidian hover:border-ink-900/35 hover:bg-ink-50",
        ghost: "text-ink-600 hover:bg-ink-900/[0.06] hover:text-obsidian",
        outline: "border border-ink-900 bg-transparent text-obsidian hover:bg-obsidian hover:text-porcelain",
        sand: "bg-clay-500 text-obsidian hover:bg-clay-300",
        danger: "bg-[#8a2f22] text-white hover:bg-[#74271d]",
        link: "text-ink-700 underline underline-offset-4 decoration-ink-300 hover:text-obsidian hover:decoration-obsidian p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[0.95rem]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
