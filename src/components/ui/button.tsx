import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const styles = {
  primary: "bg-orange text-white hover:bg-orange-dark focus-visible:outline-orange",
  secondary: "bg-navy text-white hover:bg-navy-soft focus-visible:outline-navy",
  outline: "border border-navy/15 bg-white text-navy hover:border-orange hover:text-orange focus-visible:outline-orange",
  ghost: "text-navy hover:bg-navy/5 focus-visible:outline-navy"
};

type BaseProps = { children: ReactNode; className?: string; variant?: keyof typeof styles };
type LinkButtonProps = BaseProps & { href: ComponentProps<typeof Link>["href"] } & Omit<ComponentProps<typeof Link>, "children" | "className" | "href">;
type NativeButtonProps = BaseProps & { href?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;
type Props = LinkButtonProps | NativeButtonProps;

function buttonClasses(className: string | undefined, variant: keyof typeof styles) {
  return cn("inline-flex min-h-11 max-w-full touch-manipulation items-center justify-center rounded-full px-5 py-2.5 text-center text-sm font-bold whitespace-normal transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100", styles[variant], className);
}

function LinkButton({ children, className, href, variant = "primary", ...props }: LinkButtonProps) {
  return <Link className={buttonClasses(className, variant)} href={href} {...props}>{children}</Link>;
}

function NativeButton({ children, className, variant = "primary", ...props }: NativeButtonProps) {
  return <button className={buttonClasses(className, variant)} {...props}>{children}</button>;
}

function isLinkButton(props: Props): props is LinkButtonProps {
  return props.href !== undefined;
}

export function Button(props: Props) {
  if (isLinkButton(props)) return <LinkButton {...props} />;
  return <NativeButton {...props} />;
}
