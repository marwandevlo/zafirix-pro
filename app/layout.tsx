import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AssistantOverlay } from "@/app/components/assistant/AssistantOverlay";
import { GlobalSearchOverlay } from "@/app/components/search/GlobalSearchOverlay";
import { EmailLifecycleBootstrap } from "@/app/components/lifecycle/EmailLifecycleBootstrap";
import { RecoveryHashRedirectScript } from "@/app/components/auth/RecoveryHashRedirectScript";
import { AppSubscriptionProviders } from "@/app/components/subscription/AppSubscriptionProviders";
import { FirstRunManager } from "@/app/components/onboarding/FirstRunManager";

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
  description: "Plateforme SaaS moderne pour la gestion d'entreprise, facturation et comptabilité",
  manifest: "/manifest.json?v=3",
  icons: {
    icon: [{ url: "/zafirix-favicon.png?v=3", type: "image/png" }],
    shortcut: "/zafirix-favicon.png?v=3",
    apple: "/zafirix-icon-192.png?v=3",
  },
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
        <link rel="manifest" href="/manifest.json?v=3" />
        <link rel="icon" href="/zafirix-favicon.png?v=3" type="image/png" />
        <link rel="shortcut icon" href="/zafirix-favicon.png?v=3" />
        <link rel="apple-touch-icon" href="/zafirix-icon-192.png?v=3" />
        <meta name="theme-color" content="#0F1F3D" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ZAFIRIX PRO" />
      </head>
      <body className="min-h-full flex flex-col">
        <RecoveryHashRedirectScript />
        <EmailLifecycleBootstrap />
        <AppSubscriptionProviders>{children}</AppSubscriptionProviders>
        <FirstRunManager />
        {enableGlobalSearchOverlay ? <GlobalSearchOverlay /> : null}
        {enableAssistantOverlay ? <AssistantOverlay /> : null}
      </body>
    </html>
  );
}