import { MemryError } from "@/lib/errors";

const HIGH_RISK_ACTIONS = new Set([
  "memories.delete",
  "privacy.delete",
  "constraints.delete",
]);

function isRecallEnforced(): boolean {
  return process.env.FATHIPPO_ENFORCE_HIGH_RISK_RECALL === "true";
}

export function assertPreActionRecall(request: Request, action: string): void {
  if (!HIGH_RISK_ACTIONS.has(action) || !isRecallEnforced()) {
    return;
  }

  const recallChecked =
    request.headers.get("x-fathippo-recall-checked") === "true" ||
    request.headers.get("x-fathippo-preaction-recall") === "true";

  if (!recallChecked) {
    throw new MemryError("VALIDATION_ERROR", {
      reason:
        "High-risk action requires pre-action recall. Set header x-fathippo-recall-checked: true after running memory recall.",
      action,
    });
  }
}
