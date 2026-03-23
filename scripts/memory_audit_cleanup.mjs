#!/usr/bin/env node

const API_KEY = process.env.FATHIPPO_API_KEY;
if (!API_KEY) {
  console.error("Missing FATHIPPO_API_KEY");
  process.exit(1);
}

const BASE = "https://fathippo.ai/api/v1/memories";
const APPLY = process.argv.includes("--apply");
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS || 30);
const MAX_PAGES = Number(process.env.MAX_PAGES || 500);

const DROP_BUCKETS = [
  { name: "json_blob", re: /^\s*[\[{]/ },
  { name: "tool_result", re: /Successfully (wrote|replaced|created|deleted)|bytes to \//i },
  { name: "system_wrapper", re: /Conversation info \(untrusted|Replied message \(untrusted|Result \(untrusted/i },
  { name: "logs_terminal", re: /^(WARN|INFO|DEBUG|ERROR)\s|Command exited|Process (started|stopped|exited)|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/i },
  { name: "pkg_output", re: /^(npm|yarn|bun|pnpm)\s+(install|add|remove|update)|^bun install v|^Resolving dependencies/i },
  { name: "fs_listing", re: /^[dl\-][rwx\-]{9}\s+\d+\s+\w+/ },
  { name: "prompt_boilerplate", re: /If you must inline, use MEDIA:|Task: Read prompts\//i },
  { name: "table_output", re: /^Channels\s*\n?┌|┌──/ },
  { name: "git_noise", re: /^\[main [a-f0-9]+\]|^hint: /i },
  { name: "agent_routing", re: /^What should (codex|claude|opencode) do next/i },
  { name: "ops_summary", re: /^##\s*Morning Brief|^###\s*Actions executed|^###\s*MoA retries|^-\s*Output brief saved:/i },
  { name: "code_snippet", re: /^\s*```|^st\.(subheader|write|markdown|header)\s*\(/i },
  { name: "local_path_noise", re: /\/Users\/|~\/\.openclaw\//i },
];

const KEEP_SIGNAL = [
  /\b(?:i|we)\s+(?:decided|decide|chose|choose|prefer|will always|will never|must)\b/i,
  /\b(?:my name is|call me|i am)\b/i,
  /\b(?:timezone is|i'm in|i am in)\b/i,
  /\b(?:remember this|don't forget)\b/i,
  /\b(?:root cause|resolved by|fix was|we fixed)\b/i,
  /^\s*(?:name|role|timezone|what to call)\s*:/i,
];

function classifyDrop(text) {
  for (const b of DROP_BUCKETS) if (b.re.test(text)) return b.name;
  return null;
}

function isKeepSignal(text) {
  return KEEP_SIGNAL.some((re) => re.test(text));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listMemoriesPage(before) {
  const qs = new URLSearchParams({ limit: "200" });
  if (before) qs.set("before", before);

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${BASE}?${qs.toString()}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (res.ok) {
      const body = await res.json();
      return {
        memories: body.memories || [],
        pagination: body.pagination || null,
      };
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") || "0");
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1000 * 2 ** attempt);
      await sleep(waitMs);
      continue;
    }

    throw new Error(`list failed ${res.status}`);
  }

  throw new Error("list failed 429 after retries");
}

async function listAllMemories() {
  const all = [];
  let before = undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { memories, pagination } = await listMemoriesPage(before);
    if (memories.length === 0) break;
    all.push(...memories);
    await sleep(120);

    const nextBefore = pagination?.nextBefore;
    const hasMore = Boolean(pagination?.hasMore);

    if (!nextBefore || !hasMore) break;
    before = nextBefore;
  }

  return all;
}

async function deleteMemory(id) {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${API_KEY}` } });
  return res.ok;
}

(async () => {
  let total_deleted = 0;
  let round = 0;
  let last_report = null;

  while (round < MAX_ROUNDS) {
    round += 1;
    const memories = await listAllMemories();
    const drops = [];
    const keeps = [];
    const bucket_counts = {};

    for (const m of memories) {
      const text = (m.text || "").trim();
      const bucket = classifyDrop(text);
      if (bucket) {
        drops.push({ id: m.id, text, bucket });
        bucket_counts[bucket] = (bucket_counts[bucket] || 0) + 1;
        continue;
      }

      if (isKeepSignal(text)) {
        keeps.push({ id: m.id, text });
      }
    }

    last_report = { memories, drops, keeps, bucket_counts, round };

    if (!APPLY || drops.length === 0) break;

    for (const d of drops) {
      const ok = await deleteMemory(d.id);
      if (ok) total_deleted += 1;
      await sleep(90);
    }
  }

  const report = last_report;
  console.log(`round=${report.round}`);
  console.log(`total_loaded=${report.memories.length}`);
  console.log(`drop_count=${report.drops.length}`);
  console.log(`keep_signal_count=${report.keeps.length}`);
  console.log(`deleted_total=${total_deleted}`);
  console.log("drop_buckets=");
  Object.entries(report.bucket_counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log("\nrandom_kept_samples=");
  const sample = [...report.keeps].sort(() => Math.random() - 0.5).slice(0, 30);
  sample.forEach((s, i) => console.log(`${i + 1}. ${s.text.slice(0, 140).replace(/\n/g, " ")}`));

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to delete drop matches.");
  }
})();
