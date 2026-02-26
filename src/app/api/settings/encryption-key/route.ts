import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error: "Deprecated. Recovery key export is client-side only after vault unlock.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Deprecated. Recovery key import is client-side only after vault unlock.",
    },
    { status: 410 },
  );
}
