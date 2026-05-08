const ROLE_LIMIT = 6;
let poolKeyCounter = 0;
let branchIdCounter = 0;
const RESOURCE_TIERS = {
    lite: ["orchestrator", "scout", "verifier"],
    balanced: ["orchestrator", "scout", "analyst", "verifier"],
    full: ["orchestrator", "scout", "analyst", "verifier", "synthesizer"],
};
const BASE_ROLES = [
    { id: "orchestrator", name: "Orchestrator", focus: "Keep the goal, scope, and mode aligned; route work and merge results." },
    { id: "scout", name: "Scout", focus: "Locate relevant files, docs, commands, and prior context in the repo." },
    { id: "analyst", name: "Analyst", focus: "Turn evidence into options, tradeoffs, and a clear next-step recommendation." },
    { id: "verifier", name: "Verifier", focus: "Check claims with commands, tests, or log reads before the pool settles." },
    { id: "synthesizer", name: "Synthesizer", focus: "Condense the best evidence into a stable summary the orchestrator can reuse." },
];
const SPECIAL_ROLES = [
    { id: "security_reviewer", name: "Security Reviewer", focus: "Look for safety, abuse, auth, and data-handling risks.", triggers: ["security", "vuln", "threat", "auth", "permission"] },
    { id: "debugger", name: "Debugger", focus: "Reproduce failures, isolate causes, and narrow the repair path.", triggers: ["debug", "fix", "bug", "error", "fail", "failing"] },
    { id: "release_guard", name: "Release Guard", focus: "Check ship-readiness, rollout risk, and user-visible regressions.", triggers: ["ship", "release", "deploy", "rollout"] },
    { id: "research_tracker", name: "Research Tracker", focus: "Collect background, comparisons, and scenario coverage for the loop.", triggers: ["learn", "research", "predict", "scenario"] },
    { id: "meta_orchestrator", name: "Meta Orchestrator", focus: "Owns meta-goal and child loop decisions for self-improvement runs.", triggers: ["self-improve", "recursive", "meta", "improve itself", "improve auto"] },
    { id: "pattern_analyst", name: "Pattern Analyst", focus: "Extract reusable patterns from child loop results across meta-iterations.", triggers: ["self-improve", "recursive", "meta", "pattern"] },
    { id: "strategy_advisor", name: "Strategy Advisor", focus: "Recommend tactic changes when repeated discards occur across meta-iterations.", triggers: ["self-improve", "recursive", "meta", "adapt", "strategy"] },
    { id: "regression_guard", name: "Regression Guard", focus: "Extra verification for self-modification scenarios to catch regressions.", triggers: ["self-improve", "recursive", "meta", "regression", "guard"] },
    { id: "doc_reviewer", name: "Doc Reviewer", focus: "Review documentation changes for accuracy, clarity, and completeness.", triggers: ["doc", "docs", "documentation", "wiki", "readme"] },
    { id: "test_designer", name: "Test Designer", focus: "Design tests for new functionality and identify coverage gaps.", triggers: ["test", "coverage", "tdd"] },
];
function chooseSpecialRole(goal, scope, mode) {
    const lowered = `${goal} ${scope ?? ""} ${mode}`.toLowerCase();
    return SPECIAL_ROLES.find((r) => r.triggers?.some((t) => {
        const re = new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        return re.test(lowered);
    }));
}
function chooseResourceTier(goal, scope, mode, specialRole) {
    if (mode === "background")
        return { tier: "full", reason: "Background runs need full standing pool alignment." };
    if (specialRole)
        return { tier: "full", reason: `Goal needs ${specialRole.name} coverage.` };
    const tokens = `${goal} ${scope ?? ""}`.split(/\s+/).length;
    if (tokens <= 8 && !scope)
        return { tier: "lite", reason: "Short narrow work can use a smaller pool." };
    if (tokens <= 20)
        return { tier: "balanced", reason: "Moderate work benefits from balanced coverage." };
    return { tier: "full", reason: "Broader work benefits from full standing pool." };
}
function buildRoleHandoffPrompt(template, goal, scope, mode) {
    return `You are the ${template.name}. Focus: ${template.focus} Goal: ${goal}. Scope: ${scope ?? "current repository"}. Mode: ${mode}. Do not mutate autoresearch state. Return evidence and one next-step recommendation.`;
}
export function buildSubagentPoolPlan(params) {
    const { goal, scope, mode } = params;
    const specialRole = chooseSpecialRole(goal, scope, mode);
    const { tier, reason } = chooseResourceTier(goal, scope, mode, specialRole);
    const tierRoles = RESOURCE_TIERS[tier] ?? RESOURCE_TIERS.lite;
    const allRoles = [...BASE_ROLES];
    if (specialRole)
        allRoles.push(specialRole);
    const usedRoles = allRoles.slice(0, ROLE_LIMIT);
    return {
        kind: "autoresearch_subagent_pool",
        version: 1,
        pool_key: `autoresearch-pool-${Date.now().toString(36)}-${poolKeyCounter++}`,
        role_limit: ROLE_LIMIT,
        standing_pool: true,
        reuse_across_iterations: true,
        orchestrator_role_id: "orchestrator",
        state_owner: "orchestrator",
        fallback_mode: "serial",
        resource_tier: tier,
        recommended_active_role_ids: tierRoles,
        activation: {
            during_setup: tier !== "lite",
            during_iterations: true,
            during_resume: true,
            reason,
        },
        handoff_contract: [
            "Only the orchestrator records iterations or mutates state.",
            "Non-orchestrator roles return evidence and concise recommendations.",
            "Keep the pool stable across iterations.",
        ],
        reanchor_checklist: [
            "Restate the goal, scope, metric, and verify command before the next handoff.",
            "Summarize the latest kept or discarded iteration before asking the pool for more work.",
            "Reuse current role ownership unless drift or repeated discards force a reset.",
        ],
        goal,
        scope: scope ?? null,
        mode,
        roles: usedRoles.map((r) => ({
            id: r.id,
            name: r.name,
            focus: r.focus,
            active_by_default: tierRoles.includes(r.id),
            handoff_prompt: buildRoleHandoffPrompt(r, goal, scope, mode),
        })),
        specialization: specialRole?.id ?? null,
    };
}
export function buildContinuationPolicy(mode) {
    return {
        approval_boundary: "pre_launch",
        post_launch_default: "continue",
        completion_requires_review: mode === "foreground",
        stop_conditions: [
            "user_stop",
            "configured_stop_condition",
            "needs_human",
        ],
    };
}
function selectFallbackBranch(pendingBranchId, completedDrafts, activeDrafts) {
    return pendingBranchId ?? completedDrafts[0]?.branch_id ?? activeDrafts[0]?.branch_id;
}
export function buildDraftPoolPlan(input) {
    const { num_drafts, branch_selection_policy, baseline_iteration } = input;
    const activeDrafts = [];
    for (let i = 0; i < num_drafts; i++) {
        activeDrafts.push({
            branch_id: `draft-${branchIdCounter++}`,
            iteration: i + 1,
            parent_iteration: baseline_iteration ?? 0,
            status: "pending",
        });
    }
    return {
        kind: "autoresearch_draft_pool",
        version: 1,
        num_drafts,
        branch_selection_policy,
        active_drafts: activeDrafts,
        best_branch_id: activeDrafts[0]?.branch_id,
    };
}
export function selectNextBranch(activeDrafts, policy, direction) {
    const completedDrafts = activeDrafts.filter((d) => d.status === "completed");
    const pendingBranchId = activeDrafts.find((d) => d.status === "pending")?.branch_id;
    if (completedDrafts.length === 0) {
        return pendingBranchId;
    }
    const sortDirection = direction === "lower" || direction === "higher"
        ? direction
        : (() => {
            throw new Error(`Invalid branch selection direction: ${String(direction)}`);
        })();
    switch (policy) {
        case "best": {
            const scoredDrafts = completedDrafts
                .map((draft) => ({
                branch_id: draft.branch_id,
                parsed_metric: Number.parseFloat(draft.metric_value ?? ""),
            }))
                .filter((draft) => Number.isFinite(draft.parsed_metric));
            if (scoredDrafts.length === 0) {
                return selectFallbackBranch(pendingBranchId, completedDrafts, activeDrafts);
            }
            const sorted = [...scoredDrafts].sort((a, b) => sortDirection === "lower" ? a.parsed_metric - b.parsed_metric : b.parsed_metric - a.parsed_metric);
            return sorted[0]?.branch_id;
        }
        case "roulette": {
            const idx = Math.floor(Math.random() * completedDrafts.length);
            return completedDrafts[idx]?.branch_id;
        }
        case "diverse": {
            const maxIter = Math.max(...completedDrafts.map(d => d.iteration));
            const mostRecent = completedDrafts.find(d => d.iteration === maxIter);
            return mostRecent?.branch_id ?? completedDrafts[0]?.branch_id;
        }
        default:
            return activeDrafts[0]?.branch_id;
    }
}
//# sourceMappingURL=subagent-pool.js.map