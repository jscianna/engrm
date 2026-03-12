"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPreActionRecall = assertPreActionRecall;
const errors_1 = require("@/lib/errors");
const HIGH_RISK_ACTIONS = new Set([
    "memories.delete",
    "privacy.delete",
    "constraints.delete",
]);
function isRecallEnforced() {
    return process.env.FATHIPPO_ENFORCE_HIGH_RISK_RECALL === "true";
}
function assertPreActionRecall(request, action) {
    if (!HIGH_RISK_ACTIONS.has(action) || !isRecallEnforced()) {
        return;
    }
    const recallChecked = request.headers.get("x-fathippo-recall-checked") === "true" ||
        request.headers.get("x-fathippo-preaction-recall") === "true";
    if (!recallChecked) {
        throw new errors_1.MemryError("VALIDATION_ERROR", {
            reason: "High-risk action requires pre-action recall. Set header x-fathippo-recall-checked: true after running memory recall.",
            action,
        });
    }
}
//# sourceMappingURL=pre-action-recall.js.map