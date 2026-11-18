import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { RouteTransitionIndicator } from "@/components/layout/route-transition-indicator";
import { SignedOutNotice } from "@/components/account/signed-out-notice";
import { siteConfig } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} | ${siteConfig.tagline}`, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  icons: { icon: "/brand/dovid-app-icon.svg", apple: "/brand/dovid-app-icon-512.png" }
};

export const viewport: Viewport = { colorScheme: "light", themeColor: "#0B1F44", width: "device-width", initialScale: 1 };

const structuredData={
  "@context":"https://schema.org",
  "@graph":[
    {"@type":"Organization","@id":`${siteConfig.url}#organization`,name:siteConfig.name,url:siteConfig.url,logo:new URL("/brand/dovid-primary.svg",siteConfig.url).toString(),description:siteConfig.description,areaServed:{"@type":"City",name:"Ibadan"}},
    {"@type":"WebSite","@id":`${siteConfig.url}#website`,name:siteConfig.name,url:siteConfig.url,publisher:{"@id":`${siteConfig.url}#organization`},inLanguage:"en-NG"}
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replaceAll("<","\\u003c")}}/><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a><RouteTransitionIndicator /><SignedOutNotice /><Header /><main id="main">{children}</main><Footer /></body></html>;
}
