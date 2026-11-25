"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isWorkspacePath } from "@/lib/auth/role-resolution";
import { siteConfig } from "@/config/site";

const groups = [
  { title: "Services", links: [["Motorcycle dispatch", "/services#dispatch"], ["Parcel delivery", "/services#parcel"], ["Business logistics", "/business"]] },
  { title: "Explore", links: [["How it works", "/how-it-works"], ["Pricing", "/pricing"], ["Track delivery", "/track"], ["Service areas", "/locations/ibadan"]] },
  { title: "Company", links: [["About us", "/about"], ["Contact", "/contact"], ["FAQs", "/faq"], ["Business enquiries", "/business#enquiry"]] },
  { title: "Legal", links: [["Privacy policy", "/privacy"], ["Terms of service", "/terms"], ["Cookie policy", "/cookies"]] },
] as const;

export function Footer() {
  const pathname = usePathname();
  if (isWorkspacePath(pathname)) return null;

  return <footer className="bg-navy text-white">
    <div className="container grid gap-12 py-16 lg:grid-cols-[1.2fr_2fr]">
      <div className="max-w-sm">
        <Image className="h-[58px] w-[190px]" src="/brand/dovid-reverse.svg" alt="Dovid Logistics" width={195} height={60} />
        <p className="mt-5 text-sm leading-7 text-white/70">Simple, dependable delivery for people and businesses.</p>
        <p className="mt-6 text-sm font-bold text-orange-light">Now serving Ibadan.</p>
        <div className="mt-5 grid gap-1 text-sm text-white/75">
          <a className="inline-flex min-h-11 items-center font-bold hover:text-orange-light" href={`tel:${siteConfig.support.phone}`}>{siteConfig.support.phone}</a>
          <a className="inline-flex min-h-11 items-center font-bold hover:text-orange-light" href={`https://wa.me/${siteConfig.support.whatsapp}`} target="_blank" rel="noreferrer">WhatsApp us</a>
          <a className="inline-flex min-h-11 items-center break-all font-bold hover:text-orange-light" href={`mailto:${siteConfig.support.email}`}>{siteConfig.support.email}</a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        {groups.map((group) => <div key={group.title}>
          <h2 className="text-sm font-extrabold">{group.title}</h2>
          <ul className="mt-4 grid gap-3">
            {group.links.map(([label, href]) => <li key={href}><Link href={href} className="inline-flex min-h-11 min-w-11 items-center px-1 py-1 text-sm text-white/65 transition hover:text-orange-light">{label}</Link></li>)}
          </ul>
        </div>)}
      </div>
    </div>
    <div className="border-t border-white/10">
      <div className="container flex flex-wrap items-center justify-between gap-4 py-6 text-xs text-white/55">
        <p>© {new Date().getFullYear()} Dovid Logistics. All rights reserved.</p>
        <p>Delivering trust. Moving forward.</p>
      </div>
    </div>
  </footer>;
}
