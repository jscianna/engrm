#!/usr/bin/env node

/**
 * Nightly memory quality compaction
 * - Drops low-signal operational noise
 * - Collapses exact/near-exact normalized duplicates (keeps oldest)
 *
 * Usage:
 *   FATHIPPO_API_KEY=... node scripts/nightly_memory_quality.mjs           # dry run
 *   FATHIPPO_API_KEY=... node scripts/nightly_memory_quality.mjs --apply   # delete matches
 */

const API_KEY = process.env.FATHIPPO_API_KEY;
if (!API_KEY) {
  console.error("Missing FATHIPPO_API_KEY");
  process.exit(1);
}

const BASE = process.env.FATHIPPO_API_BASE || "https://fathippo.ai/api/v1";
const APPLY = process.argv.includes("--apply");
const MAX_PAGES = Number(process.env.MAX_PAGES || 500);

const DROP_PATTERNS = [
  /^\[media attached/i,
  /^if you must inline, use media:/i,
  /^===\s*ps\s*===/i,
  /^successfully wrote \d+ bytes/i,
  /^```json/i,
  /^task:/i,
  /^set and reuse:/i,
  /^verify before use:/i,
  /^replied message/i,
  /^packages\//i,
  /^const\s+\w+/i,
  /^private\s+async\s+/i,
  /^\/plan\b/i,
  /^\/ship\b/i,
  /^https?:\/\/x\.com\//i,
  /^main agent should /i,
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\b(claude code|claude|codex|openclaw|acpx|pty|--print|--permission-mode|runtime|session[_-]?key)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldDrop(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return DROP_PATTERNS.some((re) => re.test(t));
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} failed: ${res.status}`);
  return res.json();
}

async function listAllMemories() {
  const all = [];
  let before;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({ limit: "200" });
    if (before) qs.set("before", before);
    const body = await api(`/memories?${qs.toString()}`);
    const memories = body.memories || [];
    if (memories.length === 0) break;
    all.push(...memories);
    if (!body.pagination?.hasMore || !body.pagination?.nextBefore) break;
    before = body.pagination.nextBefore;
  }
  return all;
}

async function deleteMemory(id) {
  await api(`/memories/${id}`, { method: "DELETE" });
}

(async () => {
  const memories = await listAllMemories();

  const toDelete = new Map();
  const byNormalized = new Map();

  for (const m of memories) {
    const text = (m.text || m.title || "").trim();
    if (shouldDrop(text)) {
      toDelete.set(m.id, { reason: "low_signal", id: m.id, text: text.slice(0, 140) });
      continue;
    }

    const key = normalize(text);
    if (!key || key.length < 12) {
      toDelete.set(m.id, { reason: "too_short_normalized", id: m.id, text: text.slice(0, 140) });
      continue;
    }

    const arr = byNormalized.get(key) || [];
    arr.push(m);
    byNormalized.set(key, arr);
  }

  for (const [, group] of byNormalized.entries()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const keep = group[0];
    for (const dup of group.slice(1)) {
      toDelete.set(dup.id, {
        reason: "duplicate_normalized",
        id: dup.id,
        keep: keep.id,
        text: String(dup.text || dup.title || "").slice(0, 140),
      });
    }
  }

  const items = [...toDelete.values()];
  const summary = items.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    dryRun: !APPLY,
    totalLoaded: memories.length,
    deleteCandidates: items.length,
    reasons: summary,
    sample: items.slice(0, 20),
  }, null, 2));

  if (!APPLY || items.length === 0) return;

  let deleted = 0;
  for (const item of items) {
    try {
      await deleteMemory(item.id);
      deleted += 1;
    } catch (err) {
      console.error(`Failed delete ${item.id}:`, err.message);
    }
  }

  console.log(JSON.stringify({ deleted }, null, 2));
})();
