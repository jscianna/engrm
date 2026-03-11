import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { exportCognitiveUserData } from "@/lib/cognitive-db";
import { errorResponse } from "@/lib/errors";
import { enforceRequestThrottle } from "@/lib/request-throttle";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      redirect("/");
    }

    await enforceRequestThrottle({
      scope: "dashboard.cognitive.export",
      actorKey: userId.toLowerCase(),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    const payload = await exportCognitiveUserData(userId);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="fathippo-cognitive-export-${userId}.json"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
