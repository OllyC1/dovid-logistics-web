import Link from "next/link";
import type { ReactNode } from "react";

export type WorkspaceLink = readonly [label: string, href: string];

function NavigationLinks({ links }: { links: readonly WorkspaceLink[] }) {
  return <>{links.map(([label, href]) => <Link key={href} href={href} className="rounded-xl px-3 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange">{label}</Link>)}</>;
}

export function WorkspaceNavigation({ label, links, footer }: { label: string; links: readonly WorkspaceLink[]; footer?: ReactNode }) {
  return <aside className="relative self-start rounded-2xl bg-navy p-4 text-white shadow-sm lg:sticky lg:top-28 lg:rounded-3xl lg:p-5">
    <div className="flex items-center justify-between gap-4 lg:block">
      <p className="px-2 text-xs font-bold uppercase tracking-widest text-orange lg:px-3">{label}</p>
      <details className="group lg:hidden">
        <summary className="cursor-pointer list-none rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white marker:content-none">Menu</summary>
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 rounded-2xl bg-navy p-3 shadow-2xl ring-1 ring-white/10">
          <nav className="grid gap-1" aria-label={`${label} navigation`}><NavigationLinks links={links} /></nav>
          {footer ? <div className="mt-3 border-t border-white/10 pt-3">{footer}</div> : null}
        </div>
      </details>
    </div>
    <nav className="mt-5 hidden gap-1 lg:grid" aria-label={`${label} navigation`}><NavigationLinks links={links} /></nav>
    {footer ? <div className="mt-8 hidden lg:block">{footer}</div> : null}
  </aside>;
}
