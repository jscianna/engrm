import { NextResponse } from "next/server";
import { getDb } from "@/lib/turso";

export const runtime = "nodejs";

function isAdmin(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  return Boolean(adminKey) && authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();

  if (!isAdmin(request)) {
    return NextResponse.json({ status: "error", timestamp }, { status: 401 });
  }

  try {
    const db = getDb();
    const result = await db.execute("SELECT 1 as ok");
    const ok = Number(result.rows[0]?.ok ?? 0) === 1;
    return NextResponse.json(
      { status: ok ? "ok" : "error", timestamp },
      { status: ok ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ status: "error", timestamp }, { status: 503 });
  }
}
