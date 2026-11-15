import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
export default function sitemap():MetadataRoute.Sitemap{const paths=["/","/services","/how-it-works","/pricing","/business","/about","/contact","/faq","/locations/ibadan","/privacy","/terms","/cookies"];return paths.map(path=>({url:new URL(path,siteConfig.url).toString(),lastModified:new Date(),changeFrequency:path==="/"?"weekly":"monthly",priority:path==="/"?1:.7}))}
