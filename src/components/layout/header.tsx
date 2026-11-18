"use client";

import { LoaderCircle, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { isWorkspacePath } from "@/lib/auth/role-resolution";
import { cn } from "@/lib/utils";

const logoDimensions = { width: 195, height: 60 } as const;

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginPending, setLoginPending] = useState(false);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    setLoginPending(false);
  }

  function openMobileMenu() {
    setLoginPending(false);
    setMobileMenuOpen(true);
  }

  function beginLoginNavigation() {
    setLoginPending(true);
    window.setTimeout(closeMobileMenu, 180);
  }

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMobileMenu();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  if (isWorkspacePath(pathname)) return null;

  return <>
    <header className="sticky top-0 z-50 border-b border-navy/8 bg-white/92 backdrop-blur-xl">
      <div className="container flex h-20 items-center justify-between gap-6">
        <Link href="/" aria-label="Dovid Logistics home">
          <Image className="h-auto w-[150px] sm:w-[180px]" src="/brand/dovid-primary.svg" alt="Dovid Logistics" {...logoDimensions} priority />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">
          {siteConfig.navigation.map((item) => <Link key={item.href} href={item.href} className={cn("text-sm font-semibold text-slate transition hover:text-orange", pathname === item.href && "text-orange")}>{item.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Button href="/login" variant="ghost">Log in</Button>
          <Button href="/book">Book delivery</Button>
        </div>
        <button type="button" onClick={openMobileMenu} className="grid size-12 shrink-0 place-items-center rounded-full border border-navy/10 text-navy lg:hidden" aria-label="Open navigation" aria-expanded={mobileMenuOpen} aria-controls="mobile-site-menu">
          <Menu aria-hidden="true" />
        </button>
      </div>
    </header>
    {mobileMenuOpen && typeof document !== "undefined" ? createPortal(
      <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Site menu">
        <button type="button" onClick={closeMobileMenu} className="absolute inset-0 bg-navy/65" aria-label="Close navigation" />
        <div id="mobile-site-menu" className="absolute inset-0 flex min-w-0 flex-col overflow-hidden bg-white sm:left-auto sm:w-[min(92vw,420px)] sm:shadow-2xl">
          <div className="flex min-h-20 items-center justify-between gap-4 border-b border-navy/8 px-5 py-3">
            <Image className="h-auto w-[150px]" src="/brand/dovid-primary.svg" alt="Dovid Logistics" {...logoDimensions} />
            <button type="button" onClick={closeMobileMenu} className="grid size-12 shrink-0 place-items-center rounded-full border border-navy/10 text-navy" aria-label="Close navigation">
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5">
            <p className="px-4 text-xs font-extrabold uppercase tracking-[0.18em] text-orange">Menu</p>
            <nav className="mt-3 grid gap-1" aria-label="Mobile navigation">
              <Link onClick={closeMobileMenu} className={cn("min-h-12 rounded-2xl px-4 py-3 font-bold text-navy", pathname === "/" ? "bg-cloud text-orange" : "hover:bg-cloud")} aria-current={pathname === "/" ? "page" : undefined} href="/">Home</Link>
              {siteConfig.navigation.map((item) => <Link onClick={closeMobileMenu} className={cn("min-h-12 rounded-2xl px-4 py-3 font-bold text-navy", pathname === item.href ? "bg-cloud text-orange" : "hover:bg-cloud")} aria-current={pathname === item.href ? "page" : undefined} key={item.href} href={item.href}>{item.label}</Link>)}
              <Link onClick={closeMobileMenu} className={cn("min-h-12 rounded-2xl px-4 py-3 font-bold text-navy", pathname === "/contact" ? "bg-cloud text-orange" : "hover:bg-cloud")} aria-current={pathname === "/contact" ? "page" : undefined} href="/contact">Help & contact</Link>
            </nav>
            <div className="mt-auto grid gap-3 pt-6">
              <Button className="gap-2" href="/login" variant="outline" aria-busy={loginPending} onClick={beginLoginNavigation}>
                {loginPending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Opening login…</> : "Log in"}
              </Button>
              <Button href="/book" onClick={closeMobileMenu}>Book delivery</Button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    ) : null}
  </>;
}
