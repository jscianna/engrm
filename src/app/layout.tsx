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
  metadataBase: new URL("https://fathippo.ai"),
  title: "FatHippo | Memory for AI Agents",
  description:
    "Context engine for OpenClaw — save tokens, get better results. Store what matters, automatically recall it when needed. 🦛",
  openGraph: {
    title: "FatHippo | Memory for AI Agents",
    description:
      "Context engine for OpenClaw — save tokens, get better results. Store what matters, automatically recall it when needed. 🦛",
    url: "https://fathippo.ai",
    siteName: "FatHippo",
    type: "website",
    images: [
      {
        url: "/hippo.png",
        width: 512,
        height: 512,
        alt: "FatHippo Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "FatHippo | Memory for AI Agents",
    description:
      "Context engine for OpenClaw — save tokens, get better results. Store what matters, automatically recall it when needed. 🦛",
    images: ["/hippo.png"],
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
