import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:"*",allow:"/",disallow:["/account/","/api/","/auth/","/book","/login","/register","/forgot-password","/reset-password","/pay/","/track/"]},sitemap:new URL("/sitemap.xml",siteConfig.url).toString()}}
