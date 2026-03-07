import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Engrm | Memory Infrastructure for AI Agents",
  description:
    "Persistent, encrypted memory for AI agents. Your agent recalls what matters, stores what's important, and gets smarter over time.",
  openGraph: {
    title: "Engrm | Memory Infrastructure for AI Agents",
    description:
      "Persistent, encrypted memory for AI agents. Your agent recalls what matters, stores what's important, and gets smarter over time.",
    url: "https://engrm.xyz",
    siteName: "Engrm",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Engrm | Memory Infrastructure for AI Agents",
    description:
      "Persistent, encrypted memory for AI agents. Your agent recalls what matters, stores what's important, and gets smarter over time.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // Validate that the key exists and starts with the expected prefix
  const isValidClerkKey =
    publishableKey &&
    (publishableKey.startsWith("pk_live_") ||
      publishableKey.startsWith("pk_test_")) &&
    publishableKey.length > 20;

  const app = (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="font-sans antialiased tracking-tight">
        {children}
        <Toaster richColors theme="dark" />
      </body>
    </html>
  );

  if (!isValidClerkKey) {
    return app;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {app}
    </ClerkProvider>
  );
}
