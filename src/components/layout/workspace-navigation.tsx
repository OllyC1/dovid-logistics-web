"use client";

import { useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WorkspaceLink = readonly [label: string, href: string];

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  return href.split("/").filter(Boolean).length > 1 && pathname.startsWith(`${href}/`);
}

function NavigationLinks({ links, pathname, onNavigate }: { links: readonly WorkspaceLink[]; pathname: string; onNavigate: () => void }) {
  return <>{links.map(([label, href]) => {
    const active = isActivePath(pathname, href);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={onNavigate} className={cn("touch-manipulation rounded-xl px-3 py-3 text-sm font-bold transition active:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange", active ? "bg-white text-navy shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white")}>{label}</Link>;
  })}</>;
}

export function WorkspaceNavigation({ label, links, footer }: { label: string; links: readonly WorkspaceLink[]; footer?: ReactNode }) {
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { mobileMenu.current?.removeAttribute("open"); }, [pathname]);
  function closeMobileMenu() { mobileMenu.current?.removeAttribute("open"); }
  return <aside className="relative z-40 self-start rounded-2xl bg-navy p-4 text-white shadow-sm lg:sticky lg:top-28 lg:z-auto lg:rounded-3xl lg:p-5">
    <div className="flex items-center justify-between gap-4 lg:block">
      <p className="px-2 text-xs font-bold uppercase tracking-widest text-orange lg:px-3">{label}</p>
      <details ref={mobileMenu} className="group lg:hidden">
        <summary className="flex min-h-11 touch-manipulation cursor-pointer list-none items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white transition active:scale-[0.98] marker:content-none" aria-label={`Open ${label} menu`}><Menu className="size-4" aria-hidden="true" />Menu</summary>
        <div className="fixed inset-0 z-[80] hidden group-open:block">
          <button type="button" onClick={closeMobileMenu} className="absolute inset-0 touch-manipulation bg-navy/55 backdrop-blur-sm" aria-label={`Close ${label} menu`} />
          <div className="absolute inset-y-0 right-0 flex w-[min(92vw,420px)] flex-col bg-navy p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div><p className="text-xs font-bold uppercase tracking-widest text-orange">Workspace</p><p className="mt-1 font-extrabold text-white">{label}</p></div>
              <button type="button" onClick={closeMobileMenu} className="grid size-11 touch-manipulation place-items-center rounded-full border border-white/20 text-white transition active:scale-95" aria-label={`Close ${label} menu`}><X className="size-5" aria-hidden="true" /></button>
            </div>
            <nav className="mt-5 grid flex-1 content-start gap-1 overflow-y-auto pb-6" aria-label={`${label} navigation`}><NavigationLinks links={links} pathname={pathname} onNavigate={closeMobileMenu} /></nav>
            {footer ? <div className="border-t border-white/10 pt-3">{footer}</div> : null}
          </div>
        </div>
      </details>
    </div>
    <nav className="mt-5 hidden gap-1 lg:grid" aria-label={`${label} navigation`}><NavigationLinks links={links} pathname={pathname} onNavigate={closeMobileMenu} /></nav>
    {footer ? <div className="mt-8 hidden lg:block">{footer}</div> : null}
  </aside>;
}
