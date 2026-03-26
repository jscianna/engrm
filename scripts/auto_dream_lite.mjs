#!/usr/bin/env node

/**
 * Auto-Dream Lite (MVP)
 *
 * Dry-run by default:
 *   FATHIPPO_API_KEY=... node scripts/auto_dream_lite.mjs
 *
 * Apply destructive mutations:
 *   FATHIPPO_API_KEY=... node scripts/auto_dream_lite.mjs --apply
 */

import fs from "node:fs";
import path from "node:path";

const api_key = process.env.FATHIPPO_API_KEY;
if (!api_key) {
  console.error("Missing FATHIPPO_API_KEY");
  process.exit(1);
}

const api_base = process.env.FATHIPPO_API_BASE || "https://fathippo.ai/api/v1";
const apply_mode = process.argv.includes("--apply");
const limit_per_page = Number(process.env.AUTO_DREAM_PAGE_LIMIT || 200);
const max_pages = Number(process.env.AUTO_DREAM_MAX_PAGES || 200);
const stale_days = Number(process.env.AUTO_DREAM_STALE_DAYS || 120);
const stale_access_cap = Number(process.env.AUTO_DREAM_STALE_ACCESS_CAP || 1);

const output_dir = path.resolve("artifacts", "auto_dream_lite");
fs.mkdirSync(output_dir, { recursive: true });

function normalize_text(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function age_in_days(date_like) {
  const created_ms = new Date(date_like).getTime();
  if (!Number.isFinite(created_ms)) return Infinity;
  return (Date.now() - created_ms) / (1000 * 60 * 60 * 24);
}

function find_conflict_pair(memories) {
  const contradiction_pairs = [];
  const positive_tokens = ["enabled", "use", "prefer", "always", "on"];
  const negative_tokens = ["disabled", "avoid", "never", "off", "do not"];

  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      const a = normalize_text(memories[i].text || memories[i].title || "");
      const b = normalize_text(memories[j].text || memories[j].title || "");
      if (!a || !b) continue;

      const shared_tokens = a.split(" ").filter((t) => t.length > 4 && b.includes(t));
      if (shared_tokens.length < 3) continue;

      const a_pos = positive_tokens.some((t) => a.includes(t));
      const a_neg = negative_tokens.some((t) => a.includes(t));
      const b_pos = positive_tokens.some((t) => b.includes(t));
      const b_neg = negative_tokens.some((t) => b.includes(t));

      if ((a_pos && b_neg) || (a_neg && b_pos)) {
        contradiction_pairs.push({
          newer_id: new Date(memories[i].createdAt) > new Date(memories[j].createdAt) ? memories[i].id : memories[j].id,
          older_id: new Date(memories[i].createdAt) > new Date(memories[j].createdAt) ? memories[j].id : memories[i].id,
          shared_tokens: shared_tokens.slice(0, 8),
        });
      }
    }
  }

  return contradiction_pairs;
}

async function api_fetch(pathname, init = {}) {
  const response = await fetch(`${api_base}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method || "GET"} ${pathname} failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.status === 204 ? null : response.json();
}

async function load_memories() {
  const all = [];
  let before;

  for (let page_index = 0; page_index < max_pages; page_index += 1) {
    const params = new URLSearchParams({ limit: String(limit_per_page) });
    if (before) params.set("before", before);

    const payload = await api_fetch(`/memories?${params.toString()}`);
    const page_memories = payload?.memories || [];
    if (page_memories.length === 0) break;

    all.push(...page_memories);
    const next_before = payload?.pagination?.nextBefore;
    if (!payload?.pagination?.hasMore || !next_before) break;
    before = next_before;
  }

  return all;
}

function build_plan(memories) {
  const duplicate_groups = new Map();
  const stale_candidates = [];

  for (const memory of memories) {
    const raw_text = (memory.text || memory.title || "").trim();
    if (!raw_text) continue;

    const normalized = normalize_text(raw_text);
    if (normalized.length < 12) continue;

    const existing = duplicate_groups.get(normalized) || [];
    existing.push(memory);
    duplicate_groups.set(normalized, existing);

    const age_days = age_in_days(memory.createdAt);
    const access_count = Number(memory.accessCount || 0);
    if (age_days >= stale_days && access_count <= stale_access_cap) {
      stale_candidates.push({
        id: memory.id,
        reason: "stale_low_access",
        age_days: Math.round(age_days),
        access_count,
      });
    }
  }

  const duplicate_actions = [];
  for (const [, group] of duplicate_groups.entries()) {
    if (group.length <= 1) continue;

    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const keeper = group[0];
    const duplicates = group.slice(1);

    for (const duplicate of duplicates) {
      duplicate_actions.push({
        type: "prune",
        id: duplicate.id,
        keep_id: keeper.id,
        reason: "duplicate_normalized",
      });
    }
  }

  const contradiction_actions = find_conflict_pair(memories).map((pair) => ({
    type: "supersede_proposal",
    newer_id: pair.newer_id,
    older_id: pair.older_id,
    reason: "possible_contradiction",
    shared_tokens: pair.shared_tokens,
  }));

  const stale_actions = stale_candidates.map((item) => ({
    type: "prune_proposal",
    id: item.id,
    reason: item.reason,
    age_days: item.age_days,
    access_count: item.access_count,
  }));

  return {
    duplicate_actions,
    stale_actions,
    contradiction_actions,
  };
}

async function apply_plan(plan) {
  let deleted = 0;
  for (const action of plan.duplicate_actions) {
    await api_fetch(`/memories/${action.id}`, { method: "DELETE" });
    deleted += 1;
  }
  return { deleted };
}

(async function run() {
  const started_at = new Date().toISOString();
  const memories = await load_memories();
  const plan = build_plan(memories);

  const summary = {
    started_at,
    apply_mode,
    totals: {
      loaded: memories.length,
      duplicate_rate: Number((plan.duplicate_actions.length / Math.max(1, memories.length)).toFixed(4)),
      contradiction_rate: Number((plan.contradiction_actions.length / Math.max(1, memories.length)).toFixed(4)),
      stale_memory_rate: Number((plan.stale_actions.length / Math.max(1, memories.length)).toFixed(4)),
      index_compactness: Number((1 - Math.min(1, plan.duplicate_actions.length / Math.max(1, memories.length))).toFixed(4)),
    },
    proposals: {
      prune_duplicates: plan.duplicate_actions.length,
      prune_stale: plan.stale_actions.length,
      supersede_candidates: plan.contradiction_actions.length,
    },
  };

  const stamp = started_at.replace(/[:.]/g, "-");
  const plan_path = path.join(output_dir, `plan-${stamp}.json`);
  fs.writeFileSync(plan_path, JSON.stringify({ summary, plan }, null, 2), "utf8");

  let apply_result = { deleted: 0 };
  if (apply_mode) {
    apply_result = await apply_plan(plan);
  }

  const ledger_path = path.join(output_dir, `ledger-${stamp}.jsonl`);
  const ledger_lines = [
    JSON.stringify({ event: "auto_dream_lite_started", started_at, apply_mode }),
    JSON.stringify({ event: "auto_dream_lite_summary", ...summary }),
    JSON.stringify({ event: "auto_dream_lite_apply_result", ...apply_result }),
  ];
  fs.writeFileSync(ledger_path, `${ledger_lines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    ...summary,
    apply_result,
    artifacts: {
      plan_path,
      ledger_path,
    },
  }, null, 2));
})();
