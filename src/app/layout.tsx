import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { RouteTransitionIndicator } from "@/components/layout/route-transition-indicator";
import { siteConfig } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} | ${siteConfig.tagline}`, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  category: "logistics",
  keywords: ["delivery service Ibadan", "motorcycle dispatch Ibadan", "parcel delivery Ibadan", "last-mile delivery Nigeria"],
  alternates: { canonical: siteConfig.url },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  icons: { icon: "/brand/dovid-app-icon.svg", apple: "/brand/dovid-app-icon-512.png" }
};

export const viewport: Viewport = { colorScheme: "light", themeColor: "#0B1F44", width: "device-width", initialScale: 1 };

const structuredData={
  "@context":"https://schema.org",
  "@graph":[
    {"@type":["Organization","LocalBusiness"],"@id":`${siteConfig.url}#organization`,name:siteConfig.name,url:siteConfig.url,logo:new URL("/brand/dovid-primary.svg",siteConfig.url).toString(),description:siteConfig.description,email:siteConfig.support.email,telephone:siteConfig.support.phone,contactPoint:{"@type":"ContactPoint",telephone:siteConfig.support.phone,email:siteConfig.support.email,contactType:"customer support",areaServed:"NG",availableLanguage:"English"},areaServed:{"@type":"City",name:"Ibadan"}},
    {"@type":"WebSite","@id":`${siteConfig.url}#website`,name:siteConfig.name,url:siteConfig.url,publisher:{"@id":`${siteConfig.url}#organization`},inLanguage:"en-NG"}
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NG"><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replaceAll("<","\\u003c")}}/><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a><RouteTransitionIndicator /><Header /><main id="main">{children}</main><Footer /></body></html>;
}
