import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AssistantOverlay } from "@/app/components/assistant/AssistantOverlay";
import { GlobalSearchOverlay } from "@/app/components/search/GlobalSearchOverlay";
import { EmailLifecycleBootstrap } from "@/app/components/lifecycle/EmailLifecycleBootstrap";
import { RecoveryHashRedirectScript } from "@/app/components/auth/RecoveryHashRedirectScript";
import { AppSubscriptionProviders } from "@/app/components/subscription/AppSubscriptionProviders";
import { FirstRunManager } from "@/app/components/onboarding/FirstRunManager";
import { SoundEffectsGlobalChrome } from "@/app/components/sound/SoundEffectsGlobalChrome";
import { UserPresencePing } from "@/app/components/activity/UserPresencePing";
import { AppToastHost } from "@/app/components/ui/AppToastHost";
import { PwaRegister } from "@/app/components/pwa/PwaRegister";
import { APP_BUILD_ID } from "@/app/lib/app-build-id";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZAFIRIX PRO — Gestion d'entreprise",
  description:
    "Plateforme SaaS moderne pour la gestion d'entreprise, facturation et comptabilité au Maroc",
  applicationName: "ZAFIRIX PRO",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZAFIRIX PRO",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: `/manifest.json?v=${APP_BUILD_ID.slice(0, 12)}`,
  icons: {
    icon: [
      { url: `/zafirix-favicon.png?v=${APP_BUILD_ID.slice(0, 12)}`, type: "image/png" },
      {
        url: `/zafirix-icon-192.png?v=${APP_BUILD_ID.slice(0, 12)}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: `/zafirix-icon-512.png?v=${APP_BUILD_ID.slice(0, 12)}`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcut: `/zafirix-favicon.png?v=${APP_BUILD_ID.slice(0, 12)}`,
    apple: [
      { url: `/zafirix-icon-192.png?v=${APP_BUILD_ID.slice(0, 12)}`, sizes: "192x192" },
      { url: `/apple-icon.png?v=${APP_BUILD_ID.slice(0, 12)}`, sizes: "180x180" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F1F3D" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1F3D" },
  ],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // TEMPORARY: hide the floating assistant launcher globally.
  // Re-enable by setting NEXT_PUBLIC_ATLAS_ENABLE_ASSISTANT_OVERLAY="true".
  const enableAssistantOverlay = process.env.NEXT_PUBLIC_ATLAS_ENABLE_ASSISTANT_OVERLAY === "true";
  // TEMPORARY: hide the global search overlay (full-screen fixed overlay).
  // Re-enable by setting NEXT_PUBLIC_ATLAS_ENABLE_GLOBAL_SEARCH_OVERLAY="true".
  const enableGlobalSearchOverlay = process.env.NEXT_PUBLIC_ATLAS_ENABLE_GLOBAL_SEARCH_OVERLAY === "true";

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <meta charSet="utf-8" />
        <meta name="app-build-id" content={APP_BUILD_ID} />
        <link rel="manifest" href={`/manifest.json?v=${APP_BUILD_ID.slice(0, 12)}`} />
        <link rel="icon" href={`/zafirix-favicon.png?v=${APP_BUILD_ID.slice(0, 12)}`} type="image/png" />
        <link rel="shortcut icon" href={`/zafirix-favicon.png?v=${APP_BUILD_ID.slice(0, 12)}`} />
        <link rel="apple-touch-icon" href={`/zafirix-icon-192.png?v=${APP_BUILD_ID.slice(0, 12)}`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`/apple-icon.png?v=${APP_BUILD_ID.slice(0, 12)}`} />
        <meta name="theme-color" content="#0F1F3D" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ZAFIRIX PRO" />
        <meta name="msapplication-TileColor" content="#0F1F3D" />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <RecoveryHashRedirectScript />
        <EmailLifecycleBootstrap />
        <AppSubscriptionProviders>
          <SoundEffectsGlobalChrome>{children}</SoundEffectsGlobalChrome>
        </AppSubscriptionProviders>
        <UserPresencePing />
        <FirstRunManager />
        {enableGlobalSearchOverlay ? <GlobalSearchOverlay /> : null}
        {enableAssistantOverlay ? <AssistantOverlay /> : null}
        <PwaRegister />
        <AppToastHost />
      </body>
    </html>
  );
}
