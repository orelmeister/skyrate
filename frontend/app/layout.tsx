import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const GTM_ID = "GTM-MRT2V6HZ";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";
import ChatWidget from "@/components/ChatWidget";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Analytics from "@/components/Analytics";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter"
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["400", "500", "600", "700"]
});

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://skyrate.ai"),
  title: "SkyRate AI - E-Rate Intelligence Platform",
  description: "AI-powered E-Rate funding intelligence and compliance analysis",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SkyRate AI",
    startupImage: [
      { url: '/icons/icon-512x512.png' },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "SkyRate AI - AI-Powered E-Rate Intelligence Platform",
    description: "Maximize your E-Rate funding with AI-powered analysis.",
    url: "https://skyrate.ai",
    siteName: "SkyRate AI",
    images: [{ url: '/images/marketing/og-image.png', width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: ['/images/marketing/twitter.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        {/* Google Tag Manager */}
        <Script
          id="gtm-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
        {/* End Google Tag Manager */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "SkyRate AI",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "url": "https://skyrate.ai",
              "description": "AI-powered E-Rate funding intelligence platform for consultants, vendors, and school applicants.",
              "offers": {
                "@type": "AggregateOffer",
                "lowPrice": "0",
                "highPrice": "499",
                "priceCurrency": "USD",
                "offerCount": "3"
              },
              "provider": {
                "@type": "Organization",
                "name": "SkyRate LLC",
                "url": "https://skyrate.ai",
                "logo": "https://skyrate.ai/images/logos/logo-icon-transparent.png",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "30 N Gould St Ste N",
                  "addressLocality": "Sheridan",
                  "addressRegion": "WY",
                  "postalCode": "82801",
                  "addressCountry": "US"
                },
                "contactPoint": {
                  "@type": "ContactPoint",
                  "email": "support@skyrate.ai",
                  "telephone": "+1-855-765-7291",
                  "contactType": "customer support",
                  "availableLanguage": "English"
                }
              }
            }),
          }}
        />
      </head>
      <body className={`${inter.className} antialiased bg-slate-50 text-slate-900`}>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MRT2V6HZ"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        {/* Disable Cloudflare Email Address Obfuscation for entire body */}
        {/* CF replaces emails with <span> elements which breaks React hydration */}
        <div dangerouslySetInnerHTML={{ __html: '<!--email_off-->' }} style={{ display: 'none' }} />
        <ErrorBoundary>
          <Analytics />
          <ServiceWorkerRegistrar />
          {children}
          <ChatWidget />
          <InstallPrompt />
        </ErrorBoundary>
        {process.env.NEXT_PUBLIC_TAWKTO_ID && (
          <Script
            src={`https://embed.tawk.to/${process.env.NEXT_PUBLIC_TAWKTO_ID}`}
            strategy="lazyOnload"
          />
        )}
        <div dangerouslySetInnerHTML={{ __html: '<!--/email_off-->' }} style={{ display: 'none' }} />
      </body>
    </html>
  );
}
