import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s — hoophub",
    default:  "hoophub — Gestão de clubes de basquetebol",
  },
  description: "Plantel, convocatórias, quotas e estatística de jogo num só sítio.",
  // Cada página define os seus próprios robots; o default é indexável (landing)
  robots: { index: true, follow: true },
  // Manifest, ícones e título PWA via Metadata API (e não <link> fixos no <head>)
  // para que secções como /liga-inatel possam ter o seu próprio ícone no ecrã principal.
  manifest: "/manifest.json",
  icons: {
    icon: "/icon",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "HoopHub",
    statusBarStyle: "black-translucent",
  },
};

// Viewport/theme-color via API (e não <meta> fixos) para que /liga-inatel
// possa definir a sua própria cor de tema.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F97316",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}` }} />
      </head>
      <body className={`${barlow.variable} ${barlowCondensed.variable} font-sans`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
