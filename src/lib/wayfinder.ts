const WAYFINDER_ROUTING_STRATEGY = "random";
const WAYFINDER_VERIFY_HASH = true;
const DEFAULT_GATEWAYS = [
  "https://arweave.net",
  "https://g8way.io",
  "https://ar-io.net",
] as const;

type WayfinderReadResult = {
  data: string;
  verified: boolean;
};

type WayfinderReadFn = (txId: string) => Promise<WayfinderReadResult | null>;

let cachedReadFn: Promise<WayfinderReadFn> | null = null;

function getDynamicImporter() {
  return new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
}

function coerceResponseData(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const record = response as Record<string, unknown>;
  if (typeof record.data === "string") {
    return record.data;
  }
  if (record.data instanceof Uint8Array) {
    return new TextDecoder().decode(record.data);
  }
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    if (typeof nested.text === "string") {
      return nested.text;
    }
    if (nested.bytes instanceof Uint8Array) {
      return new TextDecoder().decode(nested.bytes);
    }
  }

  return null;
}

function coerceVerified(response: unknown): boolean {
  if (!response || typeof response !== "object") {
    return false;
  }

  const record = response as Record<string, unknown>;
  if (typeof record.verified === "boolean") {
    return record.verified;
  }
  if (record.verification && typeof record.verification === "object") {
    const verification = record.verification as Record<string, unknown>;
    if (typeof verification.verified === "boolean") {
      return verification.verified;
    }
  }

  return false;
}

async function buildWayfinderReadFn(): Promise<WayfinderReadFn> {
  try {
    const dynamicImport = getDynamicImporter();
    const [wayfinderCoreRaw, arioSdkRaw] = await Promise.all([
      dynamicImport("@ar.io/wayfinder-core"),
      dynamicImport("@ar.io/sdk"),
    ]);
    const wayfinderCore = (wayfinderCoreRaw ?? {}) as Record<string, unknown>;
    const arioSdk = (arioSdkRaw ?? {}) as Record<string, unknown>;

    const WayfinderClientCtor =
      wayfinderCore.WayfinderClient ?? wayfinderCore.Wayfinder ?? wayfinderCore.default ?? null;

    if (typeof WayfinderClientCtor !== "function") {
      throw new Error("Wayfinder client constructor not found in @ar.io/wayfinder-core");
    }

    const sdkConfig =
      (typeof arioSdk.mainnet === "object" && arioSdk.mainnet) ||
      (typeof arioSdk.network === "object" && arioSdk.network) ||
      {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ClientClass = WayfinderClientCtor as new (config: Record<string, unknown>) => any;
    const client = new ClientClass({
      ...sdkConfig,
      verification: { hash: WAYFINDER_VERIFY_HASH },
      hashVerification: WAYFINDER_VERIFY_HASH,
      routing: { strategy: WAYFINDER_ROUTING_STRATEGY },
      routingStrategy: WAYFINDER_ROUTING_STRATEGY,
      gateways: DEFAULT_GATEWAYS,
    });

    return async (txId: string) => {
      try {
        const method =
          (typeof client.getTransactionData === "function" && client.getTransactionData.bind(client)) ||
          (typeof client.getData === "function" && client.getData.bind(client)) ||
          (typeof client.read === "function" && client.read.bind(client)) ||
          (typeof client.get === "function" && client.get.bind(client));

        if (!method) {
          throw new Error("No supported read method found on Wayfinder client");
        }

        const response = await method(txId, {
          verification: { hash: WAYFINDER_VERIFY_HASH },
          hashVerification: WAYFINDER_VERIFY_HASH,
          routing: { strategy: WAYFINDER_ROUTING_STRATEGY },
          routingStrategy: WAYFINDER_ROUTING_STRATEGY,
        });

        const data = coerceResponseData(response);
        if (!data) {
          return null;
        }

        return {
          data,
          verified: coerceVerified(response),
        };
      } catch (error) {
        console.error("Wayfinder read failed", error);
        return null;
      }
    };
  } catch (error) {
    console.warn("Wayfinder packages unavailable; using gateway fallback", error);

    return async (txId: string) => {
      try {
        const gateways = [...DEFAULT_GATEWAYS];
        const randomIndex = Math.floor(Math.random() * gateways.length);
        const start = gateways[randomIndex] ?? gateways[0];
        const ordered = [start, ...gateways.filter((gateway) => gateway !== start)];

        for (const gateway of ordered) {
          const response = await fetch(`${gateway}/${txId}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            continue;
          }

          const data = await response.text();
          if (!data) {
            continue;
          }

          return {
            data,
            verified: false,
          };
        }

        return null;
      } catch (fetchError) {
        console.error("Fallback Arweave gateway read failed", fetchError);
        return null;
      }
    };
  }
}

async function getReadFn(): Promise<WayfinderReadFn> {
  if (!cachedReadFn) {
    cachedReadFn = buildWayfinderReadFn();
  }
  return cachedReadFn;
}

export async function fetchArweaveData(txId: string): Promise<{ data: string; verified: boolean } | null> {
  if (!txId || !txId.trim()) {
    return null;
  }

  try {
    const readFn = await getReadFn();
    return await readFn(txId.trim());
  } catch (error) {
    console.error("Unable to fetch Arweave data via Wayfinder", error);
    return null;
  }
}
