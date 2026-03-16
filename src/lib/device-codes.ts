/**
 * Shared in-memory store for device code authentication flow.
 *
 * TODO: For multi-instance deployments (multiple serverless instances or edge replicas),
 * move this store to Redis or a DB table so all instances share state.
 */

export interface DeviceCodeEntry {
  device_code: string;
  user_code: string;
  created_at: number;
  expires_at: number;
  status: "pending" | "authorized" | "expired";
  user_id?: string;
  api_key?: string;
  agent_id?: string;
}

// Use a global Map so it persists across requests in the same serverless instance.
const globalStore = globalThis as unknown as {
  _deviceCodes?: Map<string, DeviceCodeEntry>;
};
if (!globalStore._deviceCodes) {
  globalStore._deviceCodes = new Map();
}

export const deviceCodes: Map<string, DeviceCodeEntry> =
  globalStore._deviceCodes;
