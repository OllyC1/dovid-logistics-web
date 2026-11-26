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

const unsupportedBrowserCss = `
#unsupported-browser-notice { display: none; }
@supports not ((color: oklch(50% 0.1 30)) and (font-size: 1cap)) {
  #unsupported-browser-notice {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 20px;
    background: #f5f7fa;
    color: #0b1f44;
    font-family: Arial, sans-serif;
  }
  #unsupported-browser-notice .browser-support-card {
    width: 100%;
    max-width: 520px;
    border: 1px solid #d8dee8;
    border-radius: 24px;
    padding: 24px;
    background: #ffffff;
    box-shadow: 0 18px 50px rgba(11, 31, 68, 0.14);
  }
  #unsupported-browser-notice h1 { margin: 0; font-size: 28px; line-height: 1.15; }
  #unsupported-browser-notice p { margin: 16px 0 0; font-size: 18px; line-height: 1.55; }
  #unsupported-browser-notice .browser-support-actions { display: grid; gap: 12px; margin-top: 24px; }
  #unsupported-browser-notice a {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: center;
    border: 2px solid #c44700;
    border-radius: 999px;
    padding: 12px 18px;
    color: #0b1f44;
    font-size: 17px;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
  }
  #unsupported-browser-notice a:first-child { background: #c44700; color: #ffffff; }
}
`;

export function UnsupportedBrowserNotice() {
  return <>
    <style dangerouslySetInnerHTML={{ __html: unsupportedBrowserCss }} />
    <aside id="unsupported-browser-notice" role="alert" aria-label="Browser update required">
      <div className="browser-support-card">
        <h1>Please update your browser</h1>
        <p>This browser is too old to use booking and payment safely. Update it from your phone&apos;s app store, then return to Dovid Logistics.</p>
        <p>If you need help, call or WhatsApp us on {siteConfig.support.phone}.</p>
        <div className="browser-support-actions">
          <a href="https://play.google.com/store/apps/details?id=com.android.chrome">Update Chrome on Android</a>
          <a href={`https://wa.me/${siteConfig.support.whatsapp}`}>Get help on WhatsApp</a>
          <a href={`tel:${siteConfig.support.phone}`}>Call Dovid Logistics</a>
        </div>
      </div>
    </aside>
  </>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NG"><body><UnsupportedBrowserNotice /><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replaceAll("<","\\u003c")}}/><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a><RouteTransitionIndicator /><Header /><main id="main">{children}</main><Footer /></body></html>;
}
