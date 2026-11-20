export const siteConfig = {
  name: "Dovid Logistics",
  tagline: "Delivering Trust. Moving Forward.",
  description: "Technology-enabled parcel, motorcycle dispatch, last-mile and business delivery services in Ibadan.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  market: "Ibadan, Oyo State, Nigeria",
  support: {
    email: "hello@dovidlogistics.com",
    phone: "+2347072232323",
    whatsapp: "2347072232323"
  },
  navigation: [
    { href: "/services", label: "Services" },
    { href: "/how-it-works", label: "How it works" },
    { href: "/pricing", label: "Pricing" },
    { href: "/track", label: "Track delivery" },
    { href: "/business", label: "For business" },
    { href: "/about", label: "About" }
  ]
} as const;
