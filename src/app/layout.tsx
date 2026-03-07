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
  title: "FatHippo | Memory for AI Agents",
  description:
    "Persistent, encrypted memory for AI agents. Your agent stores what matters, recalls it when needed, and saves tokens every session.",
  openGraph: {
    title: "FatHippo | Memory for AI Agents",
    description:
      "Persistent, encrypted memory for AI agents. Your agent stores what matters, recalls it when needed, and saves tokens every session.",
    url: "https://fathippo.ai",
    siteName: "FatHippo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FatHippo | Memory for AI Agents",
    description:
      "Persistent, encrypted memory for AI agents. Your agent stores what matters, recalls it when needed, and saves tokens every session.",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  return (
    <ClerkProvider publishableKey={clerkKey}>
      <html lang="en" className={inter.variable}>
        <body className="font-sans antialiased tracking-tight">
          {children}
          <Toaster richColors theme="dark" />
        </body>
      </html>
    </ClerkProvider>
  );
}
