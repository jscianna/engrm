import { createClient } from "@libsql/client";

export const runtime = "nodejs";

function forbidden(message = "Not enabled") {
  return Response.json({ error: message }, { status: 403 });
}

export async function GET(request: Request) {
  if (process.env.ENABLE_DIAGNOSTICS !== "true") {
    return forbidden("Diagnostics disabled");
  }

  const provided = request.headers.get("x-admin-key")?.trim();
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!provided || !expected || provided !== expected) {
    return forbidden("Invalid admin key");
  }

  const out: Record<string, unknown> = {
    node: process.version,
    encryption_key_format: "invalid",
    turso_url_present: Boolean(process.env.TURSO_DATABASE_URL),
  };

  const raw = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    out.encryption_key_format = "hex64";
  } else {
    try {
      const bytes = Buffer.from(raw, "base64");
      out.encryption_key_format = bytes.length === 32 ? "base64-32" : "invalid";
    } catch {
      out.encryption_key_format = "invalid";
    }
  }

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const columns = await client.execute("PRAGMA table_info(memories)");
    const names = new Set(
      columns.rows
        .map((row) => (typeof row.name === "string" ? row.name : null))
        .filter(Boolean),
    );

    out.schema = {
      memories_has_peer: names.has("peer"),
      memories_has_content_encrypted: names.has("content_encrypted"),
      memories_has_content_text: names.has("content_text"),
    };
  } catch (err) {
    out.schema_error = err instanceof Error ? err.message : String(err);
  }

  return Response.json(out);
}
