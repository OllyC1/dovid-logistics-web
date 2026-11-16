import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const styles = {
  primary: "bg-orange text-white hover:bg-orange-dark focus-visible:outline-orange",
  secondary: "bg-navy text-white hover:bg-navy-soft focus-visible:outline-navy",
  outline: "border border-navy/15 bg-white text-navy hover:border-orange hover:text-orange focus-visible:outline-orange",
  ghost: "text-navy hover:bg-navy/5 focus-visible:outline-navy"
};

type Props = { children: ReactNode; className?: string; href?: string; variant?: keyof typeof styles } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, className, href, variant = "primary", ...props }: Props) {
  const classes = cn("inline-flex min-h-11 max-w-full items-center justify-center rounded-full px-5 py-2.5 text-center text-sm font-bold whitespace-normal transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50", styles[variant], className);
  if (href) return <Link className={classes} href={href}>{children}</Link>;
  return <button className={classes} {...props}>{children}</button>;
}
