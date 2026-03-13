import { MemryError } from "@/lib/errors";
import { getUserEntitlementPlan, type EntitlementPlan } from "@/lib/db";

export enum EntitlementFeature {
  HostedSync = "hosted.sync",
  HostedHyde = "hosted.hyde",
  HostedRerank = "hosted.rerank",
  Cognition = "cognition",
}

const FEATURE_MIN_PLAN: Record<EntitlementFeature, EntitlementPlan> = {
  [EntitlementFeature.HostedSync]: "hosted",
  [EntitlementFeature.HostedHyde]: "hosted",
  [EntitlementFeature.HostedRerank]: "hosted",
  [EntitlementFeature.Cognition]: "hosted",
};

const PLAN_ORDER: Record<EntitlementPlan, number> = {
  free: 0,
  hosted: 1,
};

function upgradeHintForFeature(feature: EntitlementFeature): string {
  switch (feature) {
    case EntitlementFeature.Cognition:
      return "Upgrade to the Hosted plan to enable traces, patterns, skills, and cognitive APIs.";
    case EntitlementFeature.HostedHyde:
    case EntitlementFeature.HostedRerank:
    case EntitlementFeature.HostedSync:
    default:
      return "Upgrade to the Hosted plan to enable sync and hosted retrieval upgrades.";
  }
}

export function requiredPlanForFeature(feature: EntitlementFeature): EntitlementPlan {
  return FEATURE_MIN_PLAN[feature];
}

export function planAllowsFeature(plan: EntitlementPlan, feature: EntitlementFeature): boolean {
  return PLAN_ORDER[plan] >= PLAN_ORDER[requiredPlanForFeature(feature)];
}

export async function hasEntitlement(userId: string, feature: EntitlementFeature): Promise<boolean> {
  const plan = await getUserEntitlementPlan(userId);
  return planAllowsFeature(plan, feature);
}

export async function assertEntitlement(userId: string, feature: EntitlementFeature): Promise<EntitlementPlan> {
  const plan = await getUserEntitlementPlan(userId);
  const requiredPlan = requiredPlanForFeature(feature);
  if (!planAllowsFeature(plan, feature)) {
    throw new MemryError("ENTITLEMENT_REQUIRED", {
      feature,
      currentPlan: plan,
      requiredPlan,
      upgradeHint: upgradeHintForFeature(feature),
    });
  }
  return plan;
}

export function featureForEndpoint(endpoint: string): EntitlementFeature | null {
  if (endpoint.startsWith("sync.")) {
    return EntitlementFeature.HostedSync;
  }
  if (endpoint.startsWith("cognitive.")) {
    return EntitlementFeature.Cognition;
  }
  return null;
}
