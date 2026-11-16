"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isWorkspacePath } from "@/lib/auth/role-resolution";

export function Header() {
  const pathname = usePathname();
  if (isWorkspacePath(pathname)) return null;
  return <header className="sticky top-0 z-50 border-b border-navy/8 bg-white/92 backdrop-blur-xl"><div className="container flex h-20 items-center justify-between gap-6"><Link href="/" aria-label="Dovid Logistics home"><Image src="/brand/dovid-primary.svg" alt="Dovid Logistics" width={180} height={46} priority /></Link><nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">{siteConfig.navigation.map((item) => <Link key={item.href} href={item.href} className={cn("text-sm font-semibold text-slate transition hover:text-orange", pathname === item.href && "text-orange")}>{item.label}</Link>)}</nav><div className="hidden items-center gap-2 lg:flex"><Button href="/login" variant="ghost">Log in</Button><Button href="/book">Book delivery</Button></div><Dialog.Root><Dialog.Trigger className="grid size-11 place-items-center rounded-full border border-navy/10 text-navy lg:hidden" aria-label="Open navigation"><Menu aria-hidden="true" /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-navy/45 backdrop-blur-sm" /><Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(90vw,390px)] flex-col bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><Dialog.Title className="text-lg font-extrabold text-navy">Menu</Dialog.Title><Dialog.Close className="grid size-11 place-items-center rounded-full border border-navy/10" aria-label="Close navigation"><X /></Dialog.Close></div><nav className="mt-10 grid gap-1" aria-label="Mobile navigation"><Dialog.Close asChild><Link className="rounded-xl px-4 py-3 font-bold text-navy hover:bg-cloud" href="/">Home</Link></Dialog.Close>{siteConfig.navigation.map((item) => <Dialog.Close asChild key={item.href}><Link className="rounded-xl px-4 py-3 font-bold text-navy hover:bg-cloud" href={item.href}>{item.label}</Link></Dialog.Close>)}<Dialog.Close asChild><Link className="rounded-xl px-4 py-3 font-bold text-navy hover:bg-cloud" href="/contact">Help & contact</Link></Dialog.Close></nav><div className="mt-auto grid gap-3"><Button href="/login" variant="outline">Log in</Button><Button href="/book">Book delivery</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root></div></header>;
}
