import { validateApiKey } from "@/lib/api-auth";
import { ingestDocument } from "@/lib/ingestion";
import { errorResponse } from "@/lib/errors";
import type { ContentType } from "@/lib/ingestion/types";

const VALID_CONTENT_TYPES: ContentType[] = ["text", "markdown", "url"];

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.create");

    const body = (await request.json()) as {
      content?: string;
      contentType?: string;
      title?: string;
      metadata?: Record<string, string>;
    };

    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "content is required and must be a non-empty string" } },
        { status: 400 },
      );
    }

    const contentType = (body.contentType ?? "text") as ContentType;
    if (!VALID_CONTENT_TYPES.includes(contentType)) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: `contentType must be one of: ${VALID_CONTENT_TYPES.join(", ")}` } },
        { status: 400 },
      );
    }

    const result = await ingestDocument({
      content: body.content,
      contentType,
      userId: identity.userId,
      title: body.title,
      metadata: body.metadata,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
