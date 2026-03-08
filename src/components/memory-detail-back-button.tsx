"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function getAnalyticsReferrer(): string | null {
  if (typeof document === "undefined" || !document.referrer) {
    return null;
  }

  try {
    const referrer = new URL(document.referrer);
    if (referrer.pathname === "/dashboard/analytics") {
      return `/dashboard/analytics${referrer.search}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function MemoryDetailBackButton() {
  const router = useRouter();
  const [analyticsHref] = useState<string | null>(getAnalyticsReferrer);

  function handleBack() {
    if (analyticsHref) {
      router.push(analyticsHref);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100" onClick={handleBack}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Button>
  );
}
