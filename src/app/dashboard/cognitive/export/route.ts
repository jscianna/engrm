import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { exportCognitiveUserData } from "@/lib/cognitive-db";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const payload = await exportCognitiveUserData(userId);
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="fathippo-cognitive-export-${userId}.json"`,
    },
  });
}
