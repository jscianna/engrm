import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engrm",
  description: "Encrypted memory infrastructure for AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const app = (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Toaster richColors theme="dark" />
      </body>
    </html>
  );

  if (!publishableKey) {
    return app;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {app}
    </ClerkProvider>
  );
}
