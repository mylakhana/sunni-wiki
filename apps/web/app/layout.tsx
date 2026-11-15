import type { Metadata, Viewport } from "next"
import { Suspense } from "react"
import { Amiri, Geist, Geist_Mono, Noto_Nastaliq_Urdu } from "next/font/google"

import "@workspace/ui/globals.css"
import "./library.css"
import { ThemeProvider } from "@/components/theme-provider"
import { SearchProvider } from "@/components/library/search-provider"
import { SiteHeader } from "@/components/library/site-header"
import { cn } from "@workspace/ui/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri" })
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "600"], variable: "--font-nastaliq" })

export const metadata: Metadata = {
  title: { default: "SunniWiki · Islamic Books", template: "%s · SunniWiki" },
  description: "Read trusted Islamic books for free, in Arabic, Urdu or English.",
  applicationName: "SunniWiki",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: "SunniWiki",
    title: "SunniWiki · Islamic Books",
    description: "Read trusted Islamic books for free, in Arabic, Urdu or English.",
    locale: "en_US",
  },
  twitter: { card: "summary", title: "SunniWiki · Islamic Books", description: "Read trusted Islamic books for free, in Arabic, Urdu or English." },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable, amiri.variable, nastaliq.variable)}
    >
      <body>
        <ThemeProvider>
          <SearchProvider>
            <div className="lib-root">
              {/* usePathname() is runtime data on dynamic routes: stream the (fixed-position) header */}
              <Suspense fallback={null}>
                <SiteHeader />
              </Suspense>
              {children}
            </div>
          </SearchProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
