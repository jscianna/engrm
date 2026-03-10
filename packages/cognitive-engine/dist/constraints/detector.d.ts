/**
 * Constraint Detector
 *
 * Detects when users mention constraints/rules and auto-stores them.
 * Constraints always inject and get checked before risky actions.
 */
export type ConstraintSeverity = 'critical' | 'warning';
export interface Constraint {
    id: string;
    userId: string;
    rule: string;
    triggers: string[];
    severity: ConstraintSeverity;
    source: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}
/**
 * Check if a message contains a constraint statement
 */
export declare function detectConstraint(message: string): {
    isConstraint: boolean;
    rule?: string;
    triggers?: string[];
    severity?: ConstraintSeverity;
};
/**
 * Check if an action might violate any constraints
 */
export declare function checkActionAgainstConstraints(action: string, constraints: Constraint[]): {
    violated: Constraint[];
    warnings: Constraint[];
};
/**
 * Format constraints for injection into context
 */
export declare function formatConstraintsForInjection(constraints: Constraint[]): string;
//# sourceMappingURL=detector.d.ts.map