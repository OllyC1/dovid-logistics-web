"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isWorkspacePath } from "@/lib/auth/role-resolution";

export function Header() {
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  function closeMobileMenu() { mobileMenu.current?.removeAttribute("open"); }
  if (isWorkspacePath(pathname)) return null;
  return <header className="sticky top-0 z-50 border-b border-navy/8 bg-white/92 backdrop-blur-xl"><div className="container flex h-20 items-center justify-between gap-6"><Link href="/" aria-label="Dovid Logistics home"><Image src="/brand/dovid-primary.svg" alt="Dovid Logistics" width={180} height={46} priority /></Link><nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">{siteConfig.navigation.map((item) => <Link key={item.href} href={item.href} className={cn("text-sm font-semibold text-slate transition hover:text-orange", pathname === item.href && "text-orange")}>{item.label}</Link>)}</nav><div className="hidden items-center gap-2 lg:flex"><Button href="/login" variant="ghost">Log in</Button><Button href="/book">Book delivery</Button></div><details ref={mobileMenu} className="group lg:hidden"><summary role="button" className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-navy/10 text-navy marker:content-none" aria-label="Open navigation"><Menu aria-hidden="true" /></summary><div className="fixed inset-0 z-50 hidden group-open:block"><button type="button" onClick={closeMobileMenu} className="absolute inset-0 bg-navy/45 backdrop-blur-sm" aria-label="Close navigation" /><div className="absolute inset-y-0 right-0 flex w-[min(90vw,390px)] flex-col bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><p className="text-lg font-extrabold text-navy">Menu</p><button type="button" onClick={closeMobileMenu} className="grid size-11 place-items-center rounded-full border border-navy/10" aria-label="Close navigation"><X /></button></div><nav className="mt-10 grid gap-1" aria-label="Mobile navigation"><Link onClick={closeMobileMenu} className={cn("rounded-xl px-4 py-3 font-bold text-navy hover:bg-cloud",pathname==="/"&&"bg-cloud text-orange")} aria-current={pathname==="/"?"page":undefined} href="/">Home</Link>{siteConfig.navigation.map((item) => <Link onClick={closeMobileMenu} className={cn("rounded-xl px-4 py-3 font-bold text-navy hover:bg-cloud",pathname===item.href&&"bg-cloud text-orange")} aria-current={pathname===item.href?"page":undefined} key={item.href} href={item.href}>{item.label}</Link>)}<Link onClick={closeMobileMenu} className={cn("rounded-xl px-4 py-3 font-bold text-navy hover:bg-cloud",pathname==="/contact"&&"bg-cloud text-orange")} aria-current={pathname==="/contact"?"page":undefined} href="/contact">Help & contact</Link></nav><div className="mt-auto grid gap-3" onClick={closeMobileMenu}><Button href="/login" variant="outline">Log in</Button><Button href="/book">Book delivery</Button></div></div></div></details></div></header>;
}
