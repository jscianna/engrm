/**
 * Serialize a CodebaseProfile into compact markdown for context injection.
 * Must stay under ~2000 tokens.
 */
export function formatCodebaseProfileForInjection(profile) {
    const sections = [];
    sections.push("## Codebase DNA");
    // Stack line
    const langs = profile.techStack.languages
        .filter((l) => l.percentage >= 2)
        .map((l) => `${l.name} (${l.percentage}%)`)
        .join(", ");
    const frameworks = profile.techStack.frameworks.join(", ");
    const stackParts = [langs];
    if (frameworks)
        stackParts.push(frameworks);
    if (profile.techStack.packageManager && profile.techStack.packageManager !== "unknown") {
        stackParts.push(profile.techStack.packageManager);
    }
    if (profile.techStack.buildTools.length > 0) {
        stackParts.push(profile.techStack.buildTools.join(", "));
    }
    sections.push(`**Stack:** ${stackParts.join(" · ")}`);
    // Runtime / DB / Deploy / Test line
    const metaParts = [];
    if (profile.techStack.runtime && profile.techStack.runtime !== "unknown") {
        metaParts.push(`**Runtime:** ${profile.techStack.runtime}`);
    }
    if (profile.techStack.database.length > 0) {
        metaParts.push(`**DB:** ${profile.techStack.database.join(", ")}`);
    }
    if (profile.techStack.deployment.length > 0) {
        metaParts.push(`**Deploy:** ${profile.techStack.deployment.join(", ")}`);
    }
    if (profile.techStack.testing.length > 0) {
        metaParts.push(`**Test:** ${profile.techStack.testing.join(", ")}`);
    }
    if (metaParts.length > 0) {
        sections.push(metaParts.join(" · "));
    }
    // Structure line
    const structParts = [];
    const structTypeLabel = profile.structure.type === "monorepo"
        ? `Monorepo${profile.structure.workspaces?.length ? ` (${profile.structure.workspaces.length} workspaces)` : ""}`
        : profile.structure.type === "workspace"
            ? "Workspace"
            : "Single project";
    structParts.push(structTypeLabel);
    structParts.push(`${profile.structure.totalFiles} files`);
    if (profile.structure.totalDirectories > 0) {
        structParts.push(`${profile.structure.totalDirectories} dirs`);
    }
    sections.push(`**Structure:** ${structParts.join(" · ")}`);
    // Workspaces
    if (profile.structure.workspaces && profile.structure.workspaces.length > 0) {
        sections.push(`**Workspaces:** ${profile.structure.workspaces.join(", ")}`);
    }
    // Architecture
    if (profile.architecture.summary) {
        sections.push("");
        sections.push(`**Architecture:** ${profile.architecture.summary}`);
    }
    if (profile.architecture.patterns.length > 0) {
        sections.push(`**Patterns:** ${profile.architecture.patterns.join(", ")}`);
    }
    if (profile.architecture.conventions.length > 0) {
        sections.push(`**Conventions:** ${profile.architecture.conventions.join(", ")}`);
    }
    // Hotspots
    if (profile.hotspots.length > 0) {
        sections.push("");
        sections.push("**Hotspot files:**");
        for (const hotspot of profile.hotspots.slice(0, 8)) {
            const metricStr = hotspot.metric
                ? hotspot.reason === "most-changed"
                    ? `${hotspot.metric} commits`
                    : hotspot.reason === "largest"
                        ? `${hotspot.metric >= 1000 ? `${(hotspot.metric / 1000).toFixed(1)}k` : hotspot.metric} LOC`
                        : hotspot.reason === "most-imported"
                            ? `${hotspot.metric} imports`
                            : ""
                : "";
            const detail = [metricStr, hotspot.reason.replace("-", " ")].filter(Boolean).join(", ");
            sections.push(`- ${hotspot.path}${detail ? ` (${detail})` : ""}`);
        }
    }
    // Dependencies
    if (profile.dependencies.topDirect.length > 0) {
        sections.push("");
        sections.push(`**Top deps:** ${profile.dependencies.topDirect.join(", ")}`);
    }
    if (profile.dependencies.peerProjects && profile.dependencies.peerProjects.length > 0) {
        sections.push(`**Cross-pkg:** ${profile.dependencies.peerProjects.join(", ")}`);
    }
    // Git
    if (profile.git.totalCommits > 0) {
        const gitParts = [];
        gitParts.push(`${profile.git.totalCommits.toLocaleString()} commits`);
        if (profile.git.activeContributors > 0) {
            gitParts.push(`${profile.git.activeContributors} contributor${profile.git.activeContributors > 1 ? "s" : ""}`);
        }
        if (profile.git.branchingModel && profile.git.branchingModel !== "unknown") {
            gitParts.push(`${profile.git.branchingModel}-based`);
        }
        if (profile.git.mostActiveDirectories.length > 0) {
            gitParts.push(`active: ${profile.git.mostActiveDirectories.slice(0, 3).join(", ")}`);
        }
        sections.push(`**Git:** ${gitParts.join(" · ")}`);
    }
    return sections.join("\n") + "\n";
}
//# sourceMappingURL=serializer.js.map