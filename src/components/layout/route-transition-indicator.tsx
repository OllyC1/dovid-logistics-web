"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteTransitionIndicator() {
  const pathname = usePathname();
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);

  useEffect(() => {
    function start(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      setPendingPathname(destination.pathname);
    }
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, []);
  useEffect(() => {
    if (!pendingPathname || pendingPathname === pathname) return;
    const fallback = window.setTimeout(() => setPendingPathname(null), 10_000);
    return () => window.clearTimeout(fallback);
  }, [pathname, pendingPathname]);

  if (!pendingPathname || pendingPathname === pathname) return null;
  return <div className="pointer-events-none fixed inset-x-0 top-0 z-[100]" role="status" aria-live="polite"><div className="h-1 overflow-hidden bg-orange/20"><div className="h-full w-2/3 animate-pulse rounded-r-full bg-orange" /></div><span className="sr-only">Opening page…</span></div>;
}
