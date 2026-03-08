/**
 * Feedback Collection API
 * 
 * Stores user feedback in the database for review.
 * No authentication required to lower barrier.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/turso";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
const FEEDBACK_WINDOW_MS = 60_000;
const FEEDBACK_LIMIT_PER_WINDOW = 5;
const feedbackRateWindow = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = feedbackRateWindow.get(key);
  if (!current || current.resetAt <= now) {
    feedbackRateWindow.set(key, { count: 1, resetAt: now + FEEDBACK_WINDOW_MS });
    return false;
  }
  current.count += 1;
  feedbackRateWindow.set(key, current);
  return current.count > FEEDBACK_LIMIT_PER_WINDOW;
}

async function ensureFeedbackTable() {
  const client = getDb();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      email TEXT,
      url TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      status TEXT DEFAULT 'new'
    )
  `).catch(() => {});
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_feedback_created 
    ON feedback(created_at DESC)
  `).catch(() => {});
}

export async function POST(request: Request) {
  try {
    await ensureFeedbackTable();
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    
    const body = await request.json().catch(() => null);
    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const { userId } = await auth().catch(() => ({ userId: null }));
    
    const client = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await client.execute({
      sql: `
        INSERT INTO feedback (id, user_id, type, message, email, url, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        userId ?? null,
        body.type || "general",
        body.message.trim().slice(0, 5000), // Limit message length
        body.email?.slice(0, 255) || null,
        body.url?.slice(0, 500) || null,
        body.userAgent?.slice(0, 500) || null,
        now,
      ],
    });

    // TODO: Optionally send notification (email, Slack, etc.)
    
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[Feedback] Error:", error);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
