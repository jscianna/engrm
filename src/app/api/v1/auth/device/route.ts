import { randomBytes, randomUUID } from "crypto";
import { jsonError } from "@/lib/api-v1";
import { deviceCodes, type DeviceCodeEntry } from "@/lib/device-codes";

export const runtime = "nodejs";

const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const POLL_INTERVAL_S = 5;

// POST /api/v1/auth/device — Generate a device code
export async function POST() {
  // Clean expired entries
  const now = Date.now();
  for (const [key, entry] of deviceCodes) {
    if (now > entry.expires_at) deviceCodes.delete(key);
  }

  // Generate codes
  const device_code = randomUUID();
  const user_code = randomBytes(3).toString("hex").toUpperCase().slice(0, 6); // 6-char hex code like "A3F2B1"
  // Add a dash for readability: "A3F-2B1"
  const formatted_code = `${user_code.slice(0, 3)}-${user_code.slice(3)}`;

  const entry: DeviceCodeEntry = {
    device_code,
    user_code: formatted_code,
    created_at: now,
    expires_at: now + EXPIRY_MS,
    status: "pending",
  };

  deviceCodes.set(device_code, entry);

  return Response.json({
    device_code,
    user_code: formatted_code,
    verification_uri: "https://fathippo.ai/auth/device",
    expires_in: Math.floor(EXPIRY_MS / 1000),
    interval: POLL_INTERVAL_S,
  }, { status: 201 });
}

// GET /api/v1/auth/device?device_code=... — Poll for status (CLI calls this)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const device_code = url.searchParams.get("device_code");

  if (!device_code) {
    return jsonError("device_code required", "MISSING_PARAM", 400);
  }

  const entry = deviceCodes.get(device_code);
  if (!entry) {
    return jsonError("Invalid or expired device code", "INVALID_CODE", 404);
  }

  if (Date.now() > entry.expires_at) {
    deviceCodes.delete(device_code);
    return jsonError("Device code expired", "EXPIRED", 410);
  }

  if (entry.status === "pending") {
    return Response.json({ status: "pending" }, { status: 202 });
  }

  if (entry.status === "authorized") {
    // Return the API key and clean up
    const result = {
      status: "authorized",
      api_key: entry.api_key,
      agent_id: entry.agent_id,
    };
    deviceCodes.delete(device_code);
    return Response.json(result);
  }

  return jsonError("Unknown status", "UNKNOWN", 500);
}
