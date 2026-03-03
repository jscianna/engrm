import { PDFParse } from "pdf-parse";
import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { insertAgentMemory } from "@/lib/db";
import { upsertMemoryVector } from "@/lib/qdrant";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { cleanText } from "@/lib/content";

export const runtime = "nodejs";

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.ingest");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new MemryError("VALIDATION_ERROR", { field: "file", reason: "required" });
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      throw new MemryError("VALIDATION_ERROR", { field: "file", reason: "must be a PDF" });
    }
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      throw new MemryError("VALIDATION_ERROR", { field: "file", reason: "max 10MB" });
    }

    const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });
    const parsed = await parser.getText();
    await parser.destroy();

    const text = cleanText(parsed.text ?? "");
    if (!text) {
      throw new MemryError("VALIDATION_ERROR", { field: "file", reason: "no extractable text" });
    }

    const entities = extractEntities(text);
    const memory = await insertAgentMemory({
      userId: identity.userId,
      title: typeof formData.get("title") === "string" ? (formData.get("title") as string) : file.name.replace(/\.pdf$/i, ""),
      text,
      sourceType: "pdf",
      fileName: file.name,
      entities,
      metadata: {
        mimeType: file.type || "application/pdf",
        pageCount: parsed.total ?? undefined,
      },
    });

    const vector = await embedText(memory.text.slice(0, 6000));
    await upsertMemoryVector({
      memoryId: memory.id,
      userId: memory.userId,
      title: memory.title,
      sourceType: "pdf",
      memoryType: "episodic",
      importance: 5,
      vector,
    });

    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
