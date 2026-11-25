import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

export function createMetadata(title: string, description: string, path = "/"): Metadata {
  const canonical = new URL(path, siteConfig.url).toString();
  const brandedTitle = `${title} | ${siteConfig.name}`;
  return {
    // Page metadata is shared by public routes at the root of the app. Using an
    // absolute title keeps the brand present without the root template adding it
    // a second time.
    title: { absolute: brandedTitle },
    description,
    alternates: { canonical },
    openGraph: { title: brandedTitle, description, url: canonical, siteName: siteConfig.name, type: "website", locale: "en_NG", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: siteConfig.name }] },
    twitter: { card: "summary_large_image", title: brandedTitle, description, images: ["/opengraph-image"] }
  };
}
