export declare const CURATED_COGNITIVE_BENCHMARKS: readonly [{
    readonly applicationId: "curated-nextjs-auth-loop";
    readonly sessionId: "curated-nextjs-auth-loop";
    readonly endpoint: "curated";
    readonly problem: "Fix a Next.js auth middleware redirect loop after protecting the login callback route.";
    readonly technologies: readonly ["nextjs", "clerk", "typescript"];
    readonly repoProfile: {
        readonly workspaceType: "web-app";
        readonly projectType: "nextjs";
        readonly languages: readonly ["typescript"];
        readonly repoFamily: "next-auth-stack";
    };
    readonly expectedTraceIds: readonly ["trace-nextjs-auth-loop"];
    readonly expectedPatternIds: readonly ["pattern-nextjs-auth-loop"];
    readonly expectedSkillIds: readonly ["skill-nextjs-auth-loop"];
    readonly acceptedId: "pattern-nextjs-auth-loop";
    readonly expectedOutcome: "success";
    readonly maxRetries: 2;
    readonly targetResolutionKind: "tests_passed";
    readonly baseline: {
        readonly successRate: 0.55;
        readonly medianTimeToResolutionMs: 780000;
        readonly medianRetries: 4;
        readonly verificationPassRate: 0.45;
        readonly sampleSize: 12;
    };
}, {
    readonly applicationId: "curated-turso-vector-index";
    readonly sessionId: "curated-turso-vector-index";
    readonly endpoint: "curated";
    readonly problem: "Repair a Turso vector search failure caused by a missing embedding column or mismatched dimension.";
    readonly technologies: readonly ["turso", "sqlite", "typescript"];
    readonly repoProfile: {
        readonly workspaceType: "service";
        readonly projectType: "backend";
        readonly languages: readonly ["typescript"];
        readonly repoFamily: "vector-search-stack";
    };
    readonly expectedTraceIds: readonly ["trace-turso-vector-index"];
    readonly expectedPatternIds: readonly ["pattern-turso-vector-index"];
    readonly expectedSkillIds: readonly [];
    readonly acceptedId: "trace-turso-vector-index";
    readonly expectedOutcome: "success";
    readonly maxRetries: 3;
    readonly targetResolutionKind: "build_passed";
    readonly baseline: {
        readonly successRate: 0.48;
        readonly medianTimeToResolutionMs: 900000;
        readonly medianRetries: 5;
        readonly verificationPassRate: 0.4;
        readonly sampleSize: 10;
    };
}, {
    readonly applicationId: "curated-eslint-flat-config";
    readonly sessionId: "curated-eslint-flat-config";
    readonly endpoint: "curated";
    readonly problem: "Resolve an ESLint flat-config migration break where old config keys are still being loaded.";
    readonly technologies: readonly ["eslint", "node", "javascript"];
    readonly repoProfile: {
        readonly workspaceType: "library";
        readonly projectType: "tooling";
        readonly languages: readonly ["javascript"];
        readonly repoFamily: "lint-tooling";
    };
    readonly expectedTraceIds: readonly ["trace-eslint-flat-config"];
    readonly expectedPatternIds: readonly ["pattern-eslint-flat-config"];
    readonly expectedSkillIds: readonly ["skill-eslint-flat-config"];
    readonly acceptedId: "skill-eslint-flat-config";
    readonly expectedOutcome: "success";
    readonly maxRetries: 2;
    readonly targetResolutionKind: "lint_passed";
    readonly baseline: {
        readonly successRate: 0.62;
        readonly medianTimeToResolutionMs: 420000;
        readonly medianRetries: 3;
        readonly verificationPassRate: 0.58;
        readonly sampleSize: 9;
    };
}];
//# sourceMappingURL=cognitive-curated-benchmarks.d.ts.map