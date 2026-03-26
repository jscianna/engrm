#!/usr/bin/env node

/**
 * Topic graph maintenance (Wave 3)
 *
 * Dry run:
 *   FATHIPPO_API_KEY=... node scripts/topic_graph_maintenance.mjs
 *
 * Apply edge creation:
 *   FATHIPPO_API_KEY=... node scripts/topic_graph_maintenance.mjs --apply
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
const max_pages = Number(process.env.TOPIC_GRAPH_MAX_PAGES || 100);
const page_limit = Number(process.env.TOPIC_GRAPH_PAGE_LIMIT || 200);

const out_dir = path.resolve("artifacts", "topic_graph_maintenance");
fs.mkdirSync(out_dir, { recursive: true });

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlap(a, b) {
  const a_set = new Set((a || []).map((v) => String(v).toLowerCase()));
  const b_set = new Set((b || []).map((v) => String(v).toLowerCase()));
  if (a_set.size === 0 || b_set.size === 0) return 0;
  let shared = 0;
  for (const item of a_set) if (b_set.has(item)) shared += 1;
  return shared;
}

async function api(pathname, init = {}) {
  const response = await fetch(`${api_base}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${pathname} failed: ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function list_memories() {
  const all = [];
  let before;
  for (let i = 0; i < max_pages; i += 1) {
    const qs = new URLSearchParams({ limit: String(page_limit) });
    if (before) qs.set("before", before);
    const payload = await api(`/memories?${qs.toString()}`);
    const memories = payload.memories || [];
    if (!memories.length) break;
    all.push(...memories);
    if (!payload.pagination?.hasMore || !payload.pagination?.nextBefore) break;
    before = payload.pagination.nextBefore;
  }
  return all;
}

function build_edge_plan(memories) {
  const plan = [];
  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      const a = memories[i];
      const b = memories[j];
      const a_text = normalize(a.text || a.title || "");
      const b_text = normalize(b.text || b.title || "");
      if (!a_text || !b_text) continue;

      const same_prefix = a_text.slice(0, 80) === b_text.slice(0, 80);
      const entity_overlap = overlap(a.entities || [], b.entities || []);

      if (same_prefix || entity_overlap >= 2) {
        plan.push({
          sourceId: a.id,
          targetId: b.id,
          relationshipType: same_prefix ? "similar" : "same_entity",
          weight: same_prefix ? 0.8 : 1,
          metadata: {
            source: "topic_graph_maintenance",
            entity_overlap,
            same_prefix,
          },
        });
      }
    }
  }
  return plan;
}

async function apply_edges(plan) {
  let created = 0;
  for (const edge of plan) {
    try {
      await api("/memories/edges", {
        method: "POST",
        body: JSON.stringify(edge),
      });
      created += 1;
    } catch {
      // best-effort; skip conflicts/duplicates
    }
  }
  return { created };
}

(async function main() {
  const started_at = new Date().toISOString();
  const memories = await list_memories();
  const plan = build_edge_plan(memories);

  const summary = {
    started_at,
    apply_mode,
    memory_count: memories.length,
    planned_edges: plan.length,
  };

  const stamp = started_at.replace(/[:.]/g, "-");
  const plan_path = path.join(out_dir, `plan-${stamp}.json`);
  fs.writeFileSync(plan_path, JSON.stringify({ summary, edges: plan.slice(0, 5000) }, null, 2));

  let apply_result = { created: 0 };
  if (apply_mode) {
    apply_result = await apply_edges(plan);
  }

  console.log(JSON.stringify({ summary, apply_result, plan_path }, null, 2));
})();
