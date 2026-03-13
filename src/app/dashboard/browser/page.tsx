import { redirect } from "next/navigation";

export default function MemoryBrowserRedirectPage() {
  redirect("/dashboard/search");
}
